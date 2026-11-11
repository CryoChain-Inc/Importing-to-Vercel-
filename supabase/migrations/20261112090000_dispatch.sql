-- dispatch: paid orders are grouped into truck loads and driven as one route.
--   * One pickup stop per (order, farm, product): several listings from one farm are collected in one line.
--   * A load fits the truck (trucks.capacity_kg) and leaves when the truck is full or the oldest order has waited
--     ops_config.dispatch_wait_minutes. An order joins a truck already on the road when it fits and is close to its route.
--   * Every pending stop carries an estimated arrival (eta). The route-eta edge function replaces it with Google's.
-- Stops assigned before this migration keep their driver and their one-allocation shape.

-- ── Settings (edited by ops in the dashboard) ───────────────────────────────
alter table public.ops_config
  add column dispatch_wait_minutes integer not null default 120 check (dispatch_wait_minutes between 0 and 1440),
  add column dispatch_start time not null default '06:00',
  add column dispatch_end time not null default '17:00',
  add column detour_km numeric(5, 1) not null default 25 check (detour_km between 0 and 500),
  add column avg_speed_kmh numeric(5, 1) not null default 30 check (avg_speed_kmh between 5 and 120),
  add column road_factor numeric(3, 2) not null default 1.4 check (road_factor between 1 and 3),
  add column stop_minutes integer not null default 15 check (stop_minutes between 0 and 240),
  add column eta_buffer_pct numeric(5, 2) not null default 20 check (eta_buffer_pct between 0 and 200),
  add constraint ops_config_dispatch_hours check (dispatch_start < dispatch_end);

alter table public.ops_decisions drop constraint ops_decisions_kind_check;
alter table public.ops_decisions add constraint ops_decisions_kind_check
  check (kind in ('no_supply', 'no_farmer_price', 'no_driver', 'sms_failed', 'allocation_error', 'over_capacity'));

-- ── A pickup stop now covers many allocations ───────────────────────────────
alter table public.order_allocations
  add column pickup_stop_id uuid references public.delivery_stops (id) on delete set null;
create index order_allocations_pickup_stop_idx on public.order_allocations (pickup_stop_id);

alter table public.delivery_stops
  add column farmer_id uuid references public.profiles (id),
  add column product_id uuid references public.products (id),
  add column dispatched_at timestamptz,
  add column eta timestamptz,
  add column eta_source text check (eta_source in ('estimate', 'google')),
  add column eta_at timestamptz,
  drop constraint delivery_stops_pickup_has_allocation;

-- Existing stops: same data in the new shape (each is a line with one allocation).
update public.order_allocations a set pickup_stop_id = s.id
  from public.delivery_stops s where s.allocation_id = a.id;
update public.delivery_stops s set farmer_id = a.farmer_id, product_id = a.product_id
  from public.order_allocations a where a.id = s.allocation_id;
update public.delivery_stops set dispatched_at = created_at where driver_id is not null;

create unique index delivery_stops_one_line on public.delivery_stops (order_id, farmer_id, product_id)
  where kind = 'pickup' and state = 'pending' and allocation_id is null;

-- ── Arrival estimates ───────────────────────────────────────────────────────
-- Straight-line distance scaled to road distance, at an average speed, plus time at each place, stretched by the buffer.
-- A Google time newer than 10 minutes is kept; route-eta refreshes those while the driver's app is reporting.
create function private.refresh_etas(p_driver uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.ops_config;
  st record;
  t timestamptz := now();
  cur_lat numeric;
  cur_lng numeric;
  first boolean := true;
begin
  select * into cfg from public.ops_config where id;
  select dl.lat, dl.lng into cur_lat, cur_lng from public.driver_locations dl where dl.driver_id = p_driver;
  for st in
    select s.id, s.lat, s.lng from public.delivery_stops s
     where s.driver_id = p_driver and s.state = 'pending' and s.seq is not null order by s.seq
  loop
    if cur_lat is null then
      null; -- no known position: the first stop is "now"
    elsif first or st.lat <> cur_lat or st.lng <> cur_lng then
      t := t + make_interval(mins => case when first then 0 else cfg.stop_minutes end)
             + make_interval(secs => private.haversine_km(cur_lat, cur_lng, st.lat, st.lng) * cfg.road_factor
                                     / cfg.avg_speed_kmh * 3600 * (1 + cfg.eta_buffer_pct / 100));
    end if;
    update public.delivery_stops
       set eta = t, eta_source = 'estimate', eta_at = now()
     where id = st.id
       and not (eta_source = 'google' and eta_at > now() - interval '10 minutes' and eta is not null);
    cur_lat := st.lat;
    cur_lng := st.lng;
    first := false;
  end loop;
end;
$$;
revoke all on function private.refresh_etas(uuid) from public, anon, authenticated;

-- ── Planner ─────────────────────────────────────────────────────────────────
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
  is_full boolean;
  batch uuid[];
  oldest timestamptz;
  open_hours boolean;
  cur_lat numeric;
  cur_lng numeric;
  n integer;
  fphone text;
  eta_txt text;
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
  select s.order_id, (select coalesce(sum(oi.kg), 0) from public.order_items oi where oi.order_id = s.order_id), min(s.created_at)
    from public.delivery_stops s
   where s.driver_id is null and s.state = 'pending'
   group by s.order_id;

  create temp table if not exists _trucks (driver_id uuid primary key, capacity numeric, lat numeric, lng numeric, busy boolean, onboard numeric) on commit drop;
  truncate _trucks;
  insert into _trucks
  select t.driver_id, t.capacity_kg, dl.lat, dl.lng,
         exists (select 1 from public.delivery_stops x where x.driver_id = t.driver_id and x.state = 'pending'),
         (select coalesce(sum(oi.kg), 0) from public.order_items oi
           where oi.order_id in (select x.order_id from public.delivery_stops x
                                  where x.driver_id = t.driver_id and x.kind = 'dropoff' and x.state = 'pending'))
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

    -- Free trucks take a load: oldest orders first, as many as fit.
    for drv in
      select t.* from _trucks t where not t.busy
       order by (select min(private.haversine_km(t.lat, t.lng, s.lat, s.lng))
                   from public.delivery_stops s
                  where s.kind = 'pickup' and s.order_id = (select w.order_id from _waiting w order by w.since limit 1)),
                t.driver_id
    loop
      remaining := drv.capacity;
      is_full := false;
      batch := '{}';
      oldest := null;
      for o in select * from _waiting order by since loop
        if o.load <= remaining then
          batch := batch || o.order_id;
          remaining := remaining - o.load;
          oldest := coalesce(oldest, o.since);
        else
          is_full := true;
        end if;
      end loop;
      continue when cardinality(batch) = 0;
      -- Leave when nothing more fits, or the oldest order has waited long enough.
      continue when not is_full and oldest > now() - make_interval(mins => cfg.dispatch_wait_minutes);
      update public.delivery_stops set driver_id = drv.driver_id, dispatched_at = now()
       where order_id = any (batch) and state = 'pending' and driver_id is null;
      delete from _waiting where order_id = any (batch);
    end loop;
  end if;

  -- Orders that have waited the full window with no truck to take them need a person.
  for o in select w.order_id from _waiting w where w.since <= now() - make_interval(mins => cfg.dispatch_wait_minutes) loop
    perform private.raise_decision('no_driver', o.order_id,
      case when open_hours
        then 'No truck with a driver who has shared a location in the last 30 minutes is free for this order.'
        else 'This order is waiting for dispatch hours to start.' end,
      o.order_id::text);
  end loop;
  update public.ops_decisions d
     set status = 'resolved', resolution = 'Resolved automatically: a truck was assigned.', resolved_at = now()
   where d.status = 'open' and d.kind in ('no_driver', 'over_capacity')
     and exists (select 1 from public.delivery_stops s where s.order_id = d.order_id and s.driver_id is not null)
     and not exists (select 1 from public.delivery_stops s where s.order_id = d.order_id and s.driver_id is null and s.state = 'pending');

  -- ── Driving order: nearest next, an order's drop-off only after its pickups ─
  for drv in
    select distinct s.driver_id from public.delivery_stops s where s.driver_id is not null and s.state = 'pending'
  loop
    update public.delivery_stops set seq = null where driver_id = drv.driver_id and state = 'pending';
    select dl.lat, dl.lng into cur_lat, cur_lng from public.driver_locations dl where dl.driver_id = drv.driver_id;
    n := 0;
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

-- Checks the dispatch window without anyone opening the app.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('plan-routes', '*/5 * * * *', 'select private.plan_routes()');
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;

-- A location update moves the arrival times; coming back online also hands over waiting orders.
create or replace function public.report_driver_location(p_lat numeric, p_lng numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  prev timestamptz;
begin
  if not (select private.is_driver()) then
    raise exception 'drivers only';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;

  select updated_at into prev from public.driver_locations where driver_id = uid;
  insert into public.driver_locations (driver_id, lat, lng, updated_at)
  values (uid, p_lat, p_lng, now())
  on conflict (driver_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();

  if prev is null or prev < now() - interval '30 minutes' then
    perform private.plan_routes();
  else
    perform private.refresh_etas(uid);
  end if;
end;
$$;

-- ── Completing a stop: a pickup line collects every allocation it covers ────
create or replace function public.complete_delivery_stop(p_stop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.delivery_stops;
begin
  select * into s from public.delivery_stops where id = p_stop and driver_id = uid and state = 'pending' for update;
  if not found then
    raise exception 'stop not on your route';
  end if;
  if s.kind = 'dropoff' and exists (
       select 1 from public.delivery_stops p where p.order_id = s.order_id and p.kind = 'pickup' and p.state = 'pending') then
    raise exception 'collect all produce first';
  end if;
  if s.kind = 'pickup' and not exists (
       select 1 from public.delivery_handovers h
        where h.stop_id = s.id
          and h.recorded_kg is not null
          and h.temperature_c is not null
          and h.media_path is not null) then
    raise exception 'record the pickup first';
  end if;
  if s.kind = 'dropoff' and not exists (
       select 1 from public.delivery_handovers h
        where h.stop_id = s.id and h.temperature_c is not null and h.media_path is not null) then
    raise exception 'log the temperature';
  end if;

  update public.delivery_stops set state = 'done', done_at = now() where id = s.id;
  if s.kind = 'pickup' then
    update public.order_allocations set status = 'collected'
     where pickup_stop_id = s.id and status in ('offered', 'accepted');
  else
    with due as (
      update public.order_allocations
         set payout_status = 'payable', delivered_at = now()
       where order_id = s.order_id and status = 'collected' and payout_status = 'pending'
      returning farmer_id, amount
    )
    insert into public.notifications (user_id, title, body)
    select farmer_id, 'Order delivered',
           format('Your produce reached the buyer. GH₵ %s is now ready to be paid to your wallet.', to_char(sum(amount), 'FM999G999G990D00'))
      from due group by farmer_id;
  end if;
  perform private.plan_routes();
end;
$$;

-- ── Allocation no longer promises a time: the farmer hears it when the truck is dispatched ──
create or replace function private.allocate_order(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.orders;
  item record;
  cand record;
  need numeric;
  fprice numeric;
  take numeric;
  alloc_id uuid;
  pay numeric;
  fphone text;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or ord.state <> 'paid' or ord.delivery_lat is null or ord.delivery_lng is null then
    return;
  end if;

  for item in
    select oi.product_id, oi.unit, oi.kg, p.name
      from public.order_items oi join public.products p on p.id = oi.product_id
     where oi.order_id = ord.id
  loop
    select item.kg - coalesce(sum(a.kg), 0) into need
      from public.order_allocations a
     where a.order_id = ord.id and a.product_id = item.product_id and a.unit = item.unit
       and a.status in ('offered', 'accepted', 'collected');
    continue when need <= 0;

    select private.farmer_price(pp.price) into fprice from public.product_prices pp
      join public.products pr on pr.id = pp.product_id
     where pp.product_id = item.product_id and pr.unit = item.unit;
    if fprice is null then
      perform private.raise_decision('no_farmer_price', ord.id,
        format('No farmer price is set for %s (%s), so %s %s of order %s could not be allocated.', item.name, item.unit, need, item.unit, ord.code),
        ord.id::text || item.product_id::text || item.unit);
      continue;
    end if;

    for cand in
      select l.id as listing_id, l.farmer_id, kb.km as km_buyer,
             l.weight_kg - coalesce((
               select sum(a.kg) from public.order_allocations a
                where a.listing_id = l.id and a.status in ('offered', 'accepted', 'collected', 'declined', 'expired')), 0) as cap
        from public.produce_listings l
        join public.farmers f on f.id = l.farmer_id
        cross join lateral (
          select private.haversine_km(f.latitude::numeric, f.longitude::numeric, ord.delivery_lat::numeric, ord.delivery_lng::numeric) as km
        ) kb
        left join lateral (
          select min(private.haversine_km(dl.lat, dl.lng, f.latitude::numeric, f.longitude::numeric)) as km
            from public.driver_locations dl where dl.updated_at > now() - interval '30 minutes'
        ) kd on true
       where lower(btrim(l.product)) = lower(btrim(item.name))
         and l.unit = item.unit
         and l.lot_id is null
         and f.latitude is not null and f.longitude is not null
         and not exists (select 1 from public.captures c where c.listing_id = l.id)
       order by kb.km + 0.5 * coalesce(kd.km, 0), l.created_at
    loop
      continue when cand.cap <= 0;
      take := least(need, cand.cap);
      pay := round(take * fprice, 2);

      insert into public.order_allocations (order_id, product_id, listing_id, farmer_id, unit, kg, farmer_price, amount, km_to_buyer, status)
      values (ord.id, item.product_id, cand.listing_id, cand.farmer_id, item.unit, take, fprice, pay, round(cand.km_buyer, 1), 'accepted')
      returning id into alloc_id;

      -- Farmers see what to supply and what they earn, never who the buyer is.
      insert into public.notifications (user_id, title, body)
      values (cand.farmer_id, 'Produce reserved',
        format('%s %s of your %s is reserved for an order. We will tell you when the truck is on its way. You earn GH₵ %s once it is collected.', take, item.unit, item.name, to_char(pay, 'FM999G999G990D00')));

      select pr.phone into fphone from public.profiles pr where pr.id = cand.farmer_id;
      insert into public.sms_outbox (user_id, allocation_id, phone, body, status, error)
      values (cand.farmer_id, alloc_id, fphone,
        format('CryoChain: %s %s of your %s is reserved for an order. We will text you when the truck is on its way. You earn GHS %s once collected.', take, item.unit, item.name, to_char(pay, 'FM999G999G990D00')),
        case when fphone is null then 'failed' else 'pending' end,
        case when fphone is null then 'Farmer has no phone number' end);
      if fphone is null then
        perform private.raise_decision('sms_failed', ord.id,
          'A farmer has no phone number on file, so no SMS was sent. The pickup is in their app.', alloc_id::text);
      end if;

      need := need - take;
      exit when need <= 0;
    end loop;

    if need > 0 then
      perform private.raise_decision('no_supply', ord.id,
        format('%s %s of %s on order %s is paid for but no farmer can cover it.', need, item.unit, item.name, ord.code),
        ord.id::text || item.product_id::text || item.unit);
    else
      perform private.auto_resolve_decision('no_supply', ord.id::text || item.product_id::text || item.unit, 'Resolved automatically: fully allocated.');
      perform private.auto_resolve_decision('no_farmer_price', ord.id::text || item.product_id::text || item.unit, 'Resolved automatically: fully allocated.');
    end if;
  end loop;

  perform private.plan_routes();
end;
$$;

-- ── Driver's work: a pickup is a line (all allocations of one product from one farm), with its arrival time ──
create or replace function public.driver_deliveries()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or not (select private.is_driver()) then
    raise exception 'driver only';
  end if;

  return jsonb_build_object(
    'tempMin', (select min_temp_c from public.ops_config where id),
    'tempMax', (select max_temp_c from public.ops_config where id),
    'orders', coalesce((
      select jsonb_agg(q.obj order by q.ongoing desc, q.seq nulls last, q.done_at desc nulls last)
      from (
        select
          bool_or(s.state = 'pending') as ongoing,
          min(s.seq) filter (where s.state = 'pending') as seq,
          max(s.done_at) as done_at,
          jsonb_build_object(
            'id', o.id,
            'code', o.code,
            'ongoing', bool_or(s.state = 'pending'),
            'buyerName', coalesce(nullif(btrim(bp.display_name), ''), 'Buyer'),
            'buyerPhone', coalesce(bp.phone, ''),
            'address', coalesce(o.delivery_address, ''),
            'lat', o.delivery_lat,
            'lng', o.delivery_lng,
            'pickups', coalesce((
              select jsonb_agg(p.obj order by p.seq nulls last, p.created_at)
              from (
                select s2.seq, s2.created_at,
                  jsonb_build_object(
                    'stopId', s2.id,
                    'farmerName', coalesce(nullif(btrim(fp.display_name), ''), 'Farmer'),
                    'farmerPhone', coalesce(fp.phone, ''),
                    'place', concat_ws(', ',
                      nullif(btrim(f.line1), ''), nullif(btrim(f.address), ''),
                      nullif(btrim(f.landmark), ''), nullif(btrim(f.city), ''),
                      nullif(btrim(f.postcode), ''), nullif(btrim(f.locality), '')),
                    'product', pr.name,
                    'expectedKg', a.kg,
                    'expectedUnit', a.unit,
                    'lat', s2.lat,
                    'lng', s2.lng,
                    'state', s2.state,
                    'seq', s2.seq,
                    'eta', s2.eta,
                    'farmerId', s2.farmer_id,
                    'recordedKg', h.recorded_kg,
                    'temperatureC', h.temperature_c,
                    'note', coalesce(h.note, ''),
                    'mediaPath', h.media_path,
                    'mediaKind', h.media_kind
                  ) as obj
                from public.delivery_stops s2
                cross join lateral (
                  select coalesce(sum(x.kg), 0) as kg, min(x.unit) as unit
                    from public.order_allocations x
                   where x.pickup_stop_id = s2.id and x.status in ('offered', 'accepted', 'collected')
                ) a
                join public.products pr on pr.id = s2.product_id
                join public.farmers f on f.id = s2.farmer_id
                left join public.profiles fp on fp.id = s2.farmer_id
                left join public.delivery_handovers h on h.stop_id = s2.id
                where s2.order_id = o.id and s2.driver_id = uid and s2.kind = 'pickup'
              ) p
            ), '[]'::jsonb),
            'dropoff', (
              select jsonb_build_object(
                'stopId', s3.id,
                'lat', s3.lat,
                'lng', s3.lng,
                'state', s3.state,
                'seq', s3.seq,
                'eta', s3.eta,
                'temperatureC', h3.temperature_c,
                'note', coalesce(h3.note, ''),
                'mediaPath', h3.media_path,
                'mediaKind', h3.media_kind
              )
              from public.delivery_stops s3
              left join public.delivery_handovers h3 on h3.stop_id = s3.id
              where s3.order_id = o.id and s3.driver_id = uid and s3.kind = 'dropoff'
              limit 1
            )
          ) as obj
        from public.delivery_stops s
        join public.orders o on o.id = s.order_id
        left join public.profiles bp on bp.id = o.buyer_id
        where s.driver_id = uid
        group by o.id, o.code, o.delivery_address, o.delivery_lat, o.delivery_lng, bp.display_name, bp.phone
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

-- ── Google arrival times ────────────────────────────────────────────────────
-- Called by the route-eta edge function (service role) with Google's drive time, in seconds, to each pending stop
-- in route order: truck -> stop 1, stop 1 -> stop 2, and so on. The time at each place and the buffer are applied
-- here so both kinds of estimate follow the same rules.
create function public.set_route_etas(p_driver uuid, p_seconds numeric[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg public.ops_config;
  st record;
  t timestamptz := now();
  i integer := 0;
begin
  select * into cfg from public.ops_config where id;
  for st in
    select s.id from public.delivery_stops s
     where s.driver_id = p_driver and s.state = 'pending' and s.seq is not null order by s.seq
  loop
    i := i + 1;
    exit when i > coalesce(cardinality(p_seconds), 0);
    -- A leg of a few seconds is the same farm: no second wait there.
    t := t + make_interval(mins => case when i > 1 and p_seconds[i] > 30 then cfg.stop_minutes else 0 end)
           + make_interval(secs => greatest(p_seconds[i], 0) * (1 + cfg.eta_buffer_pct / 100));
    update public.delivery_stops set eta = t, eta_source = 'google', eta_at = now() where id = st.id;
  end loop;
end;
$$;
revoke all on function public.set_route_etas(uuid, numeric[]) from public, anon, authenticated;
grant execute on function public.set_route_etas(uuid, numeric[]) to service_role;
