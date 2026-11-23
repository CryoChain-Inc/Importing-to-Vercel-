-- topup-next-stop: a top-up pickup (another farm covering a short collection) is the driver's next stop.
-- The truck already carries that order's produce and its buyer is waiting, so it goes ahead of every drop-off,
-- also on a route ops ordered by hand. Before, it was sorted nearest-first or put at the end of a hand-ordered route.
create or replace function private.plan_routes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.ops_config;
  g record;
  o record;
  drv record;
  nxt record;
  st record;
  sid uuid;
  max_cap numeric;
  remaining numeric;
  batch uuid[];
  open_hours boolean;
  cur_lat numeric;
  cur_lng numeric;
  n integer;
  fphone text;
  eta_txt text;
  k integer;
begin
  perform pg_advisory_xact_lock(7001);
  select * into cfg from public.ops_config where id;

  -- Stops whose produce is no longer coming.
  delete from public.delivery_stops s
   where s.state = 'pending' and s.kind = 'pickup'
     and not exists (select 1 from public.order_allocations a where a.pickup_stop_id = s.id and a.status in ('offered', 'accepted'));
  delete from public.delivery_stops s
   where s.state = 'pending' and s.kind = 'dropoff'
     and not exists (select 1 from public.order_allocations a where a.order_id = s.order_id and a.status in ('offered', 'accepted', 'collected'));

  -- One pickup line per order, farm and product.
  for g in
    select a.order_id, a.farmer_id, a.product_id
      from public.order_allocations a
      join public.farmers f on f.id = a.farmer_id
     where a.status in ('offered', 'accepted') and a.pickup_stop_id is null and f.latitude is not null
     group by a.order_id, a.farmer_id, a.product_id
  loop
    select s.id into sid from public.delivery_stops s
     where s.order_id = g.order_id and s.farmer_id = g.farmer_id and s.product_id = g.product_id
       and s.kind = 'pickup' and s.state = 'pending' and s.allocation_id is null;
    if sid is null then
      insert into public.delivery_stops (order_id, farmer_id, product_id, kind, label, lat, lng)
      select g.order_id, g.farmer_id, g.product_id, 'pickup', 'Pick up', f.latitude::numeric(9, 6), f.longitude::numeric(9, 6)
        from public.farmers f where f.id = g.farmer_id
      returning id into sid;
    end if;
    update public.order_allocations set pickup_stop_id = sid
     where order_id = g.order_id and farmer_id = g.farmer_id and product_id = g.product_id
       and status in ('offered', 'accepted') and pickup_stop_id is null;
    update public.delivery_stops s
       set label = (
         select 'Pick up ' || sum(a.kg)::text || ' ' || min(a.unit) || ' ' || p.name || ' · ' || coalesce(nullif(f.locality, ''), 'farm')
           from public.order_allocations a
           join public.products p on p.id = a.product_id
           join public.farmers f on f.id = a.farmer_id
          where a.pickup_stop_id = s.id and a.status in ('offered', 'accepted')
          group by p.name, f.locality)
     where s.id = sid;
  end loop;

  insert into public.delivery_stops (order_id, kind, label, lat, lng)
  select ord.id, 'dropoff', 'Deliver ' || ord.code || ' · ' || coalesce(ord.delivery_address, 'buyer'),
         ord.delivery_lat::numeric(9, 6), ord.delivery_lng::numeric(9, 6)
    from public.orders ord
   where ord.state = 'paid' and ord.delivery_lat is not null
     and exists (select 1 from public.order_allocations a where a.order_id = ord.id and a.status in ('offered', 'accepted', 'collected'))
     and not exists (select 1 from public.delivery_stops s where s.order_id = ord.id and s.kind = 'dropoff');

  -- A new line on an order that is already on a truck rides with it (a top-up after a shortage, a late allocation).
  update public.delivery_stops s
     set driver_id = d.driver_id, dispatched_at = now()
    from (select distinct on (x.order_id) x.order_id, x.driver_id from public.delivery_stops x
           where x.driver_id is not null and x.state = 'pending') d
   where s.order_id = d.order_id and s.driver_id is null and s.state = 'pending';

  -- ── Assignment ────────────────────────────────────────────────────────────
  create temp table if not exists _waiting (order_id uuid primary key, load numeric, since timestamptz) on commit drop;
  truncate _waiting;
  insert into _waiting
  select s.order_id, private.order_load_kg(s.order_id), min(s.created_at)
    from public.delivery_stops s
   where s.driver_id is null and s.state = 'pending'
   group by s.order_id;

  create temp table if not exists _trucks (driver_id uuid primary key, capacity numeric, lat numeric, lng numeric, busy boolean, onboard numeric) on commit drop;
  truncate _trucks;
  insert into _trucks
  select t.driver_id, t.capacity_kg, dl.lat, dl.lng,
         exists (select 1 from public.delivery_stops x where x.driver_id = t.driver_id and x.state = 'pending'),
         (select coalesce(sum(private.order_load_kg(d.order_id)), 0)
            from (select distinct x.order_id from public.delivery_stops x
                   where x.driver_id = t.driver_id and x.kind = 'dropoff' and x.state = 'pending') d)
    from public.trucks t
    join public.driver_locations dl on dl.driver_id = t.driver_id and dl.updated_at > now() - interval '30 minutes'
   where t.active and t.driver_id is not null;

  select max(t.capacity_kg) into max_cap from public.trucks t where t.active and t.driver_id is not null;
  for o in select w.order_id, w.load, ord.code from _waiting w join public.orders ord on ord.id = w.order_id where w.load > max_cap loop
    perform private.raise_decision('over_capacity', o.order_id,
      format('Order %s carries %s, more than any truck in service can take (%s). Split it or add a larger truck.', o.code, o.load, max_cap),
      o.order_id::text);
  end loop;
  delete from _waiting w where max_cap is not null and w.load > max_cap;

  open_hours := (now() at time zone 'Africa/Accra')::time between cfg.dispatch_start and cfg.dispatch_end;

  if open_hours then
    -- Trucks already on the road pick up orders that fit and lie close to what they still have to drive.
    for drv in select * from _trucks where busy order by driver_id loop
      remaining := drv.capacity - drv.onboard;
      for o in select * from _waiting order by since loop
        continue when o.load > remaining;
        continue when exists (
          select 1 from public.delivery_stops ns
           where ns.order_id = o.order_id and ns.state = 'pending'
             and not exists (
               select 1 from public.delivery_stops rs
                where rs.driver_id = drv.driver_id and rs.state = 'pending'
                  and private.haversine_km(ns.lat, ns.lng, rs.lat, rs.lng) <= cfg.detour_km)
             and private.haversine_km(ns.lat, ns.lng, drv.lat, drv.lng) > cfg.detour_km);
        update public.delivery_stops set driver_id = drv.driver_id, dispatched_at = now()
         where order_id = o.order_id and state = 'pending' and driver_id is null;
        delete from _waiting where order_id = o.order_id;
        remaining := remaining - o.load;
      end loop;
    end loop;

    -- A free truck leaves at once with the oldest orders that fit. Orders that fit nowhere wait for space, see the decision below.
    for drv in
      select t.* from _trucks t where not t.busy
       order by (select min(private.haversine_km(t.lat, t.lng, s.lat, s.lng))
                   from public.delivery_stops s
                  where s.kind = 'pickup' and s.order_id = (select w.order_id from _waiting w order by w.since limit 1)),
                t.driver_id
    loop
      remaining := drv.capacity;
      batch := '{}';
      for o in select * from _waiting order by since loop
        if o.load <= remaining then
          batch := batch || o.order_id;
          remaining := remaining - o.load;
        end if;
      end loop;
      continue when cardinality(batch) = 0;
      update public.delivery_stops set driver_id = drv.driver_id, dispatched_at = now()
       where order_id = any (batch) and state = 'pending' and driver_id is null;
      delete from _waiting where order_id = any (batch);
    end loop;
  end if;

  -- An order that fits no truck waits for space (a truck finishing, or coming online); each stop done or location update re-plans at once.
  -- Once it has waited the full window, ops decide by hand.
  for o in
    select w.order_id, w.load, ord.code from _waiting w join public.orders ord on ord.id = w.order_id
     where w.since <= now() - make_interval(mins => cfg.dispatch_wait_minutes)
  loop
    perform private.raise_decision('no_driver', o.order_id,
      case
        when not open_hours then 'This order is waiting for dispatch hours to start.'
        when not exists (select 1 from _trucks) then
          format('Order %s needs a truck, but no truck has a driver who shared a location in the last 30 minutes. Assign it by hand.', o.code)
        else
          format('Order %s weighs about %s kg and no truck can take it: the most free space on any truck is about %s kg, and trucks already on the road are too far away. It goes to the next truck to finish, or assign it by hand.',
                 o.code, round(o.load), (select round(greatest(max(t.capacity - t.onboard), 0)) from _trucks t))
      end,
      o.order_id::text);
  end loop;
  update public.ops_decisions d
     set status = 'resolved', resolution = 'Resolved automatically: a truck was assigned.', resolved_at = now()
   where d.status = 'open' and d.kind in ('no_driver', 'over_capacity')
     and exists (select 1 from public.delivery_stops s where s.order_id = d.order_id and s.driver_id is not null)
     and not exists (select 1 from public.delivery_stops s where s.order_id = d.order_id and s.driver_id is null and s.state = 'pending');

  -- Trips that have ended hand route order back to the system.
  update public.drivers dr set route_locked = false
   where dr.route_locked and not exists (select 1 from public.delivery_stops s where s.driver_id = dr.id and s.state = 'pending');

  -- ── Driving order: nearest next, an order's drop-off only after its pickups ─
  -- A route ops have ordered by hand keeps its order; only stops added since are placed, after it.
  -- Except a new top-up pickup for produce already on board: it goes first, nearest first.
  for drv in
    select distinct s.driver_id, coalesce(dr.route_locked, false) as locked
      from public.delivery_stops s join public.drivers dr on dr.id = s.driver_id
     where s.state = 'pending'
  loop
    if not drv.locked then
      update public.delivery_stops set seq = null where driver_id = drv.driver_id and state = 'pending';
    end if;
    select count(*) into k from public.delivery_stops s
     where s.driver_id = drv.driver_id and s.state = 'pending' and s.kind = 'pickup' and s.seq is null
       and exists (select 1 from public.delivery_stops d where d.order_id = s.order_id and d.kind = 'pickup' and d.state = 'done');
    if k > 0 then
      update public.delivery_stops set seq = seq + k where driver_id = drv.driver_id and state = 'pending' and seq is not null;
      select dl.lat, dl.lng into cur_lat, cur_lng from public.driver_locations dl where dl.driver_id = drv.driver_id;
      n := 0;
      loop
        select s.id, s.lat, s.lng into nxt
          from public.delivery_stops s
         where s.driver_id = drv.driver_id and s.state = 'pending' and s.kind = 'pickup' and s.seq is null
           and exists (select 1 from public.delivery_stops d where d.order_id = s.order_id and d.kind = 'pickup' and d.state = 'done')
         order by case when cur_lat is null then 0 else private.haversine_km(cur_lat, cur_lng, s.lat, s.lng) end, s.created_at
         limit 1;
        exit when nxt.id is null;
        n := n + 1;
        update public.delivery_stops set seq = n where id = nxt.id;
        cur_lat := nxt.lat;
        cur_lng := nxt.lng;
      end loop;
    end if;
    if drv.locked then
      -- A new pickup on an order whose drop-off is already placed moves that drop-off to after it.
      update public.delivery_stops d set seq = null
       where d.driver_id = drv.driver_id and d.state = 'pending' and d.kind = 'dropoff'
         and exists (select 1 from public.delivery_stops p where p.order_id = d.order_id and p.driver_id = drv.driver_id
                      and p.kind = 'pickup' and p.state = 'pending' and p.seq is null);
      select coalesce(max(s.seq), 0) into n from public.delivery_stops s where s.driver_id = drv.driver_id and s.state = 'pending';
      select s.lat, s.lng into cur_lat, cur_lng from public.delivery_stops s
       where s.driver_id = drv.driver_id and s.state = 'pending' and s.seq = n;
      if not found then
        select dl.lat, dl.lng into cur_lat, cur_lng from public.driver_locations dl where dl.driver_id = drv.driver_id;
      end if;
    elsif k = 0 then
      select dl.lat, dl.lng into cur_lat, cur_lng from public.driver_locations dl where dl.driver_id = drv.driver_id;
      n := 0;
    end if;
    loop
      select s.id, s.lat, s.lng into nxt
        from public.delivery_stops s
       where s.driver_id = drv.driver_id and s.state = 'pending' and s.seq is null
         and (s.kind = 'pickup' or not exists (
               select 1 from public.delivery_stops p
                where p.order_id = s.order_id and p.driver_id = s.driver_id and p.kind = 'pickup' and p.state = 'pending' and p.seq is null))
       order by case when cur_lat is null then 0 else private.haversine_km(cur_lat, cur_lng, s.lat, s.lng) end,
                s.farmer_id, s.created_at
       limit 1;
      exit when nxt.id is null;
      n := n + 1;
      update public.delivery_stops set seq = n where id = nxt.id;
      cur_lat := nxt.lat;
      cur_lng := nxt.lng;
    end loop;
    perform private.refresh_etas(drv.driver_id);
  end loop;

  -- ── Tell each farmer when the truck is coming (once per line) ─────────────
  for st in
    select s.id, s.farmer_id, s.eta, s.label
      from public.delivery_stops s
     where s.kind = 'pickup' and s.state = 'pending' and s.driver_id is not null and s.eta is not null
       and exists (select 1 from public.order_allocations a where a.pickup_stop_id = s.id and a.pickup_at is null)
  loop
    update public.order_allocations set pickup_at = st.eta where pickup_stop_id = st.id and pickup_at is null;
    eta_txt := to_char(st.eta at time zone 'Africa/Accra', 'FMDay DD Mon') || ' around ' || to_char(st.eta at time zone 'Africa/Accra', 'HH24:MI');
    insert into public.notifications (user_id, title, body)
    values (st.farmer_id, 'Truck on the way', format('%s. Our truck should reach you on %s.', split_part(st.label, ' · ', 1), eta_txt));
    select pr.phone into fphone from public.profiles pr where pr.id = st.farmer_id;
    if fphone is not null then
      insert into public.sms_outbox (user_id, phone, body)
      values (st.farmer_id, fphone, format('CryoChain: %s. Our truck should reach you on %s.', split_part(st.label, ' · ', 1), eta_txt));
    end if;
  end loop;
end;
$$;
