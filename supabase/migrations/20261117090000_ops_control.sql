-- ops-control: ops fix any live exception from the dashboard, and every manual change is recorded.
--   ops_actions: who did what, to which order, and why. Every function below writes to it; settings changes too.
--   drivers.route_locked: a route ops ordered by hand keeps its order until the trip ends or ops unlock it.

create table public.ops_actions (
  id bigint generated always as identity primary key,
  order_id uuid references public.orders (id) on delete cascade,
  actor uuid references public.profiles (id),
  action text not null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index ops_actions_order_idx on public.ops_actions (order_id, at desc);
alter table public.ops_actions enable row level security;
revoke all on table public.ops_actions from anon, authenticated;
grant select on public.ops_actions to authenticated;
create policy ops_actions_select_ops on public.ops_actions for select to authenticated using ((select private.is_ops()));

alter table public.drivers add column route_locked boolean not null default false;

alter table public.ops_decisions drop constraint ops_decisions_kind_check;
alter table public.ops_decisions add constraint ops_decisions_kind_check
  check (kind in ('no_supply', 'no_farmer_price', 'no_driver', 'sms_failed', 'allocation_error', 'over_capacity', 'short_supply'));

-- Checks the caller is ops and has given a reason, and records the action. Returns the caller.
create function private.ops_act(p_order uuid, p_action text, p_reason text, p_details jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  why text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if why is null or char_length(why) > 280 then
    raise exception 'give a reason';
  end if;
  insert into public.ops_actions (order_id, actor, action, reason, details) values (p_order, uid, p_action, why, p_details);
  return uid;
end;
$$;
revoke all on function private.ops_act(uuid, text, text, jsonb) from public, anon, authenticated;

-- Settings changes are recorded with what changed.
create function private.log_ops_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed jsonb;
begin
  select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)) into changed
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
   where n.value is distinct from o.value and n.key <> 'updated_at';
  if changed is not null then
    insert into public.ops_actions (actor, action, details) values ((select auth.uid()), 'settings', changed);
  end if;
  return new;
end;
$$;
create trigger ops_config_log after update on public.ops_config for each row execute function private.log_ops_config();

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

  -- Trips that have ended hand route order back to the system.
  update public.drivers dr set route_locked = false
   where dr.route_locked and not exists (select 1 from public.delivery_stops s where s.driver_id = dr.id and s.state = 'pending');

  -- ── Driving order: nearest next, an order's drop-off only after its pickups ─
  -- A route ops have ordered by hand keeps its order; only stops added since are placed, after it.
  for drv in
    select distinct s.driver_id, coalesce(dr.route_locked, false) as locked
      from public.delivery_stops s join public.drivers dr on dr.id = s.driver_id
     where s.state = 'pending'
  loop
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
    else
      update public.delivery_stops set seq = null where driver_id = drv.driver_id and state = 'pending';
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

create function private.finish_stop(p_stop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.delivery_stops;
begin
  select * into s from public.delivery_stops where id = p_stop;
  update public.delivery_stops set state = 'done', done_at = now() where id = s.id;
  if s.kind = 'pickup' then
    perform private.collect_line(s.id);
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
end;
$$;
revoke all on function private.finish_stop(uuid) from public, anon, authenticated;

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

  perform private.finish_stop(s.id);
  perform private.plan_routes();
end;
$$;
-- ── Move an order to another truck, or back to waiting ──────────────────────
-- Only before anything is collected: collected produce is already on the first truck.
-- Returns a warning when the truck would be over capacity; ops may know the load is lighter.
create function public.ops_reassign_order(p_order uuid, p_driver uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap numeric;
  load numeric;
  onboard numeric;
  warn text;
begin
  perform private.ops_act(p_order, 'reassign', p_reason, jsonb_build_object('driver', p_driver));
  if exists (select 1 from public.delivery_stops where order_id = p_order and state = 'done') then
    raise exception 'part of this order is already collected';
  end if;
  if not exists (select 1 from public.delivery_stops where order_id = p_order and state = 'pending') then
    raise exception 'nothing to move';
  end if;
  if p_driver is not null then
    select t.capacity_kg into cap from public.trucks t where t.driver_id = p_driver and t.active;
    if cap is null then
      raise exception 'that driver has no truck';
    end if;
    select coalesce(sum(kg), 0) into load from public.order_items where order_id = p_order;
    select coalesce(sum(oi.kg), 0) into onboard from public.order_items oi
     where oi.order_id <> p_order and oi.order_id in (
       select s.order_id from public.delivery_stops s where s.driver_id = p_driver and s.kind = 'dropoff' and s.state = 'pending');
    if load + onboard > cap then
      warn := format('The truck now carries %s against a capacity of %s.', trim_scale(load + onboard), trim_scale(cap));
    end if;
  end if;
  update public.delivery_stops
     set driver_id = p_driver, seq = null, eta = null, eta_source = null,
         dispatched_at = case when p_driver is null then null else now() end
   where order_id = p_order and state = 'pending';
  perform private.plan_routes();
  return warn;
end;
$$;

-- ── Set a driver's stop order by hand ───────────────────────────────────────
create function public.ops_reorder_stops(p_driver uuid, p_stops uuid[], p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i integer;
begin
  perform private.ops_act(null, 'reorder', p_reason, jsonb_build_object('driver', p_driver, 'stops', to_jsonb(p_stops)));
  if (select array_agg(id order by id) from public.delivery_stops where driver_id = p_driver and state = 'pending')
     is distinct from (select array_agg(x order by x) from unnest(p_stops) x) then
    raise exception 'the route has changed, reload and try again';
  end if;
  if exists (
    select 1 from public.delivery_stops d join public.delivery_stops p
      on p.order_id = d.order_id and p.kind = 'pickup' and p.state = 'pending'
     where d.id = any (p_stops) and d.kind = 'dropoff'
       and array_position(p_stops, p.id) > array_position(p_stops, d.id)) then
    raise exception 'a delivery must come after its pickups';
  end if;
  for i in 1 .. cardinality(p_stops) loop
    update public.delivery_stops set seq = i where id = p_stops[i];
  end loop;
  update public.drivers set route_locked = true where id = p_driver;
  perform private.refresh_etas(p_driver);
end;
$$;

create function public.ops_unlock_route(p_driver uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.ops_act(null, 'unlock_route', p_reason, jsonb_build_object('driver', p_driver));
  update public.drivers set route_locked = false where id = p_driver;
  perform private.plan_routes();
end;
$$;

-- ── A pickup line before collection: take it from another farm, or record it as short ──
create function private.ops_drop_line(p_stop uuid)
returns public.delivery_stops
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.delivery_stops;
begin
  select * into s from public.delivery_stops where id = p_stop for update;
  if not found or s.kind <> 'pickup' then
    raise exception 'not a pickup';
  end if;
  if s.state <> 'pending' then
    raise exception 'already collected';
  end if;
  -- declined: this farm is not asked again for this order, and the quantity leaves its listing.
  update public.order_allocations set status = 'declined', responded_at = now()
   where pickup_stop_id = p_stop and status in ('offered', 'accepted');
  return s;
end;
$$;
revoke all on function private.ops_drop_line(uuid) from public, anon, authenticated;

create function public.ops_resource_line(p_stop uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.delivery_stops;
  qty numeric;
begin
  select coalesce(sum(kg), 0) into qty from public.order_allocations where pickup_stop_id = p_stop and status in ('offered', 'accepted');
  select * into s from public.delivery_stops where id = p_stop;
  perform private.ops_act(s.order_id, 'resource_line', p_reason, jsonb_build_object('stop', p_stop, 'quantity', qty));
  s := private.ops_drop_line(p_stop);
  perform private.settle_shortfall(s.order_id, s.product_id, qty, qty);
  perform private.plan_routes();
end;
$$;

create function public.ops_cancel_line(p_stop uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.delivery_stops;
  qty numeric;
  ord public.orders;
  pname text;
begin
  select coalesce(sum(kg), 0) into qty from public.order_allocations where pickup_stop_id = p_stop and status in ('offered', 'accepted');
  select * into s from public.delivery_stops where id = p_stop;
  perform private.ops_act(s.order_id, 'cancel_line', p_reason, jsonb_build_object('stop', p_stop, 'quantity', qty));
  s := private.ops_drop_line(p_stop);
  -- Recorded as short straight away: the refund request follows from it.
  update public.order_items set short_kg = short_kg + qty where order_id = s.order_id and product_id = s.product_id;
  select * into ord from public.orders where id = s.order_id;
  select name into pname from public.products where id = s.product_id;
  insert into public.notifications (user_id, title, body)
  values (ord.buyer_id, 'Part of your order is short',
    format('We could not supply %s of %s for order %s. The rest is on its way, and you will be refunded for the missing quantity.', qty, pname, ord.code));
  perform private.plan_routes();
end;
$$;

-- ── Complete a stop for a driver whose phone is not working ─────────────────
create function public.ops_complete_stop(p_stop uuid, p_kg numeric, p_celsius numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.delivery_stops;
  reserved numeric;
begin
  select * into s from public.delivery_stops where id = p_stop for update;
  if not found then
    raise exception 'stop not found';
  end if;
  perform private.ops_act(s.order_id, 'complete_stop', p_reason, jsonb_build_object('stop', p_stop, 'quantity', p_kg, 'temperature', p_celsius));
  if s.state <> 'pending' then
    raise exception 'already done';
  end if;
  if s.driver_id is null then
    raise exception 'the stop has no driver';
  end if;
  if p_celsius is null or p_celsius not between -100 and 100 then
    raise exception 'temperature out of range';
  end if;
  if s.kind = 'pickup' then
    select coalesce(sum(kg), 0) into reserved from public.order_allocations where pickup_stop_id = p_stop and status in ('offered', 'accepted');
    if p_kg is null or p_kg < 0 or p_kg > reserved then
      raise exception 'quantity must be between 0 and %', reserved;
    end if;
  elsif exists (select 1 from public.delivery_stops p where p.order_id = s.order_id and p.kind = 'pickup' and p.state = 'pending') then
    raise exception 'collect all produce first';
  end if;
  insert into public.delivery_handovers (stop_id, driver_id, recorded_kg, temperature_c, note)
  values (s.id, s.driver_id, case when s.kind = 'pickup' then p_kg end, p_celsius, left('Recorded by ops: ' || btrim(p_reason), 280))
  on conflict (stop_id) do update
    set recorded_kg = excluded.recorded_kg, temperature_c = excluded.temperature_c, note = excluded.note;
  perform private.finish_stop(s.id);
  perform private.plan_routes();
end;
$$;

-- ── Correct a pickup quantity recorded wrongly, before the order is delivered ──
-- Changes what the farmer is paid and what is left on their listing. Top-ups and refunds already triggered by the
-- original reading are not undone; ops handle those with the actions above.
create function public.ops_correct_pickup(p_stop uuid, p_kg numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.delivery_stops;
  l record;
  expected numeric;
  remaining numeric;
  got numeric;
  was numeric;
  old_ids uuid[];
begin
  select * into s from public.delivery_stops where id = p_stop for update;
  if not found or s.kind <> 'pickup' then
    raise exception 'not a pickup';
  end if;
  select coalesce(sum(kg) filter (where status in ('collected', 'declined')), 0), coalesce(sum(kg) filter (where status = 'collected'), 0)
    into expected, was from public.order_allocations where pickup_stop_id = p_stop;
  perform private.ops_act(s.order_id, 'correct_pickup', p_reason, jsonb_build_object('stop', p_stop, 'from', was, 'to', p_kg));
  if s.state <> 'done' then
    raise exception 'not collected yet';
  end if;
  if private.order_is_delivered(s.order_id) then
    raise exception 'already delivered';
  end if;
  if p_kg is null or p_kg < 0 or p_kg > expected then
    raise exception 'quantity must be between 0 and %', expected;
  end if;

  -- Same split as at pickup: oldest listing first. The old rows stay as cancelled history.
  select array_agg(id) into old_ids from public.order_allocations where pickup_stop_id = p_stop and status in ('collected', 'declined');
  remaining := p_kg;
  for l in
    select a.listing_id, min(a.farmer_id::text)::uuid as farmer_id, min(a.product_id::text)::uuid as product_id, min(a.unit) as unit,
           max(a.farmer_price) as price, max(a.km_to_buyer) as km, sum(a.kg) as kg, min(pl.created_at) as listed
      from public.order_allocations a join public.produce_listings pl on pl.id = a.listing_id
     where a.pickup_stop_id = p_stop and a.status in ('collected', 'declined')
     group by a.listing_id order by listed
  loop
    got := least(l.kg, remaining);
    remaining := remaining - got;
    if got > 0 then
      insert into public.order_allocations (order_id, product_id, listing_id, farmer_id, unit, kg, farmer_price, amount, km_to_buyer, status, pickup_stop_id)
      values (s.order_id, l.product_id, l.listing_id, l.farmer_id, l.unit, got, l.price, round(got * l.price, 2), l.km, 'collected', p_stop);
    end if;
    if got < l.kg then
      insert into public.order_allocations (order_id, product_id, listing_id, farmer_id, unit, kg, farmer_price, amount, km_to_buyer, status, responded_at, pickup_stop_id)
      values (s.order_id, l.product_id, l.listing_id, l.farmer_id, l.unit, l.kg - got, l.price, round((l.kg - got) * l.price, 2), l.km, 'declined', now(), p_stop);
    end if;
  end loop;
  update public.order_allocations set status = 'cancelled' where id = any (old_ids);
end;
$$;

revoke all on function public.ops_reassign_order(uuid, uuid, text), public.ops_reorder_stops(uuid, uuid[], text),
  public.ops_unlock_route(uuid, text), public.ops_resource_line(uuid, text), public.ops_cancel_line(uuid, text),
  public.ops_complete_stop(uuid, numeric, numeric, text), public.ops_correct_pickup(uuid, numeric, text) from public, anon;
grant execute on function public.ops_reassign_order(uuid, uuid, text), public.ops_reorder_stops(uuid, uuid[], text),
  public.ops_unlock_route(uuid, text), public.ops_resource_line(uuid, text), public.ops_cancel_line(uuid, text),
  public.ops_complete_stop(uuid, numeric, numeric, text), public.ops_correct_pickup(uuid, numeric, text) to authenticated;

-- ── What happened to an order, system and people, newest first ──────────────
create function public.ops_order_activity(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('at', e.at, 'what', e.what, 'who', e.who, 'why', e.why) order by e.at desc)
    from (
      select o.created_at as at, 'Order placed' as what, null::text as who, null::text as why from public.orders o where o.id = p_order
      union all select o.paid_at, 'Paid', null, null from public.orders o where o.id = p_order and o.paid_at is not null
      union all select min(a.created_at), format('Reserved %s %s %s from %s', sum(a.kg), min(a.unit), min(p.name), coalesce(min(pr.display_name), 'a farm')), null, null
        from public.order_allocations a join public.products p on p.id = a.product_id left join public.profiles pr on pr.id = a.farmer_id
       where a.order_id = p_order and a.status <> 'cancelled' group by a.farmer_id, a.product_id, date_trunc('second', a.created_at)
      union all select s.dispatched_at, 'Put on a truck', null, null from public.delivery_stops s where s.order_id = p_order and s.kind = 'dropoff' and s.dispatched_at is not null
      union all select s.done_at, case when s.kind = 'pickup' then 'Collected: ' || s.label else 'Delivered' end, null, null
        from public.delivery_stops s where s.order_id = p_order and s.state = 'done'
      union all select r.created_at, format('Refund of GH₵ %s requested', r.amount), null, null from public.refunds r where r.order_id = p_order
      union all select r.refunded_at, format('Refund of GH₵ %s sent', r.amount), null, null from public.refunds r where r.order_id = p_order and r.refunded_at is not null
      union all select x.at, replace(x.action, '_', ' '), coalesce(pr.display_name, 'Ops'), x.reason
        from public.ops_actions x left join public.profiles pr on pr.id = x.actor where x.order_id = p_order
    ) e where e.at is not null
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.ops_order_activity(uuid) from public, anon;
grant execute on function public.ops_order_activity(uuid) to authenticated;
