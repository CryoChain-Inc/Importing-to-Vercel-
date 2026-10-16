-- Route plans are built from PAID lots (escrow_funded). One route = one date, one agent, one driver, several
-- lots, so one truck can collect along a corridor and deliver to several buyers.
--   route_stops : the collection points, each with a pickup window that farmers are told about
--   route_lots  : the lots on the route, each with its buyer's delivery window and its own proof of delivery
-- Capturing a listing creates its settlement (weight x grade price, less fee). It becomes payable only once the
-- lot is delivered. The lot -> listings link is produce_listings.lot_id (set by create_lot).

-- ── Stops are collection points, not (point, product) pairs ─────────────────
alter table public.route_stops drop constraint route_stops_route_id_collection_point_id_product_key;
alter table public.route_stops
  alter column product drop not null,
  add column window_start timestamptz,
  add column window_end timestamptz,
  add column position smallint,
  add constraint route_stops_window check (window_end is null or window_end > window_start);
create unique index route_stops_one_point_per_route on public.route_stops (route_id, collection_point_id) where product is null;

create table public.route_lots (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  lot_id uuid not null unique references public.lots (id),
  window_start timestamptz not null,
  window_end timestamptz not null,
  delivered_at timestamptz,
  received_by text,
  delivery_photo_path text,
  constraint route_lots_window check (window_end > window_start),
  constraint route_lots_receiver_len check (received_by is null or char_length(btrim(received_by)) between 2 and 80)
);
create index route_lots_route_idx on public.route_lots (route_id);

alter table public.route_lots enable row level security;
revoke all on table public.route_lots from anon, authenticated;
grant select on public.route_lots to authenticated;
create policy route_lots_select on public.route_lots for select to authenticated
  using (
    (select private.is_ops())
    or exists (select 1 from public.routes r where r.id = route_id and (r.agent_id = (select auth.uid()) or r.driver_id = (select auth.uid())))
  );

-- ── Settlements ─────────────────────────────────────────────────────────────
create table public.settlements (
  listing_id uuid primary key references public.produce_listings (id) on delete cascade,
  farmer_id uuid not null references public.profiles (id),
  lot_id uuid not null references public.lots (id),
  recorded_kg numeric(10, 2) not null,
  grade text not null,
  price_per_kg numeric(10, 2) not null,
  gross numeric(12, 2) not null,
  fee_rate numeric(5, 4) not null,
  fee numeric(12, 2) not null,
  net numeric(12, 2) not null,
  -- pending until the lot is delivered, then payable; paid is set by the payout run
  status text not null default 'pending' check (status in ('pending', 'payable', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payable_at timestamptz,
  paid_at timestamptz
);
create index settlements_farmer_idx on public.settlements (farmer_id, created_at desc);
create index settlements_lot_idx on public.settlements (lot_id);

alter table public.settlements enable row level security;
revoke all on table public.settlements from anon, authenticated;
grant select on public.settlements to authenticated;
create policy settlements_select_own on public.settlements for select to authenticated using (farmer_id = (select auth.uid()));
create policy settlements_select_ops on public.settlements for select to authenticated using ((select private.is_ops()));

-- ── Farmer notices ──────────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
-- Written only by the database functions below.

-- ── Helpers (security definer, so policies don't recurse through RLS) ───────
create or replace function private.agent_on_lot(p_lot uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.route_lots rl
    join public.routes r on r.id = rl.route_id
    where rl.lot_id = p_lot and r.agent_id = (select auth.uid())
  );
$$;

create or replace function private.agent_serves_farmer(p_farmer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.produce_listings l
    where l.farmer_id = p_farmer and l.lot_id is not null and (select private.agent_on_lot(l.lot_id))
  );
$$;

-- Captures are allowed only for listings in a lot on the agent's route for today.
create or replace function private.agent_can_capture(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.produce_listings l
    join public.route_lots rl on rl.lot_id = l.lot_id
    join public.routes r on r.id = rl.route_id
    where l.id = p_listing
      and r.agent_id = (select auth.uid())
      and r.service_date = (timezone('Africa/Accra', now()))::date
  );
$$;

-- A buyer may view the capture photographs of lots they have paid for.
create or replace function private.buyer_can_view_capture(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.captures c
    join public.produce_listings l on l.id = c.listing_id
    join public.orders o on o.lot_id = l.lot_id
    where c.photo_path = p_path and o.buyer_id = (select auth.uid()) and o.state = 'paid'
  );
$$;

-- Counts for one stop: the listings of the route's lots at that collection point.
create or replace function private.stop_stats(p_stop uuid)
returns table (farmers int, captured int, listed_kg numeric, captured_kg numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select count(l.id)::int, count(c.listing_id)::int, coalesce(sum(l.weight_kg), 0), coalesce(sum(c.recorded_kg), 0)
  from public.route_stops s
  join public.route_lots rl on rl.route_id = s.route_id
  join public.produce_listings l on l.lot_id = rl.lot_id and l.collection_point_id = s.collection_point_id
  left join public.captures c on c.listing_id = l.id
  where s.id = p_stop;
$$;

revoke all on function private.agent_on_lot(uuid), private.agent_serves_farmer(uuid), private.agent_can_capture(uuid),
  private.buyer_can_view_capture(text), private.stop_stats(uuid) from public, anon;
grant execute on function private.agent_on_lot(uuid), private.agent_serves_farmer(uuid), private.agent_can_capture(uuid),
  private.buyer_can_view_capture(text), private.stop_stats(uuid) to authenticated;

-- ── Agent / buyer access follows the route's lots ───────────────────────────
drop policy if exists produce_listings_select_agent on public.produce_listings;
create policy produce_listings_select_agent on public.produce_listings
  for select to authenticated
  using (lot_id is not null and (select private.agent_on_lot(lot_id)));

drop policy if exists captures_insert_own on public.captures;
create policy captures_insert_own on public.captures
  for insert to authenticated
  with check (agent_id = (select auth.uid()) and (select private.is_agent()) and (select private.agent_can_capture(listing_id)));

drop policy if exists captures_update_own on public.captures;
create policy captures_update_own on public.captures
  for update to authenticated
  using (agent_id = (select auth.uid()) and (select private.is_agent()) and (select private.agent_can_capture(listing_id)))
  with check (agent_id = (select auth.uid()));

create policy settlements_select_agent on public.settlements for select to authenticated
  using ((select private.agent_on_lot(lot_id)));

create policy captures_storage_select_buyer on storage.objects
  for select to authenticated
  using (bucket_id = 'captures' and (select private.buyer_can_view_capture(name)));

-- ── Capture -> settlement (+ farmer notice) ─────────────────────────────────
create or replace function private.settle_capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.produce_listings;
  old_status text;
  v_price numeric;
  v_rate numeric;
  v_gross numeric;
  v_fee numeric;
begin
  select * into l from public.produce_listings where id = new.listing_id;
  if l.lot_id is null then
    raise exception 'listing is not in a lot';
  end if;

  select status into old_status from public.settlements where listing_id = new.listing_id;
  if old_status is not null and old_status <> 'pending' then
    raise exception 'capture is locked';
  end if;

  if new.grade = 'Reject' then
    v_price := 0;
  else
    select cp.price into v_price
      from public.crop_prices cp join public.products pr on pr.id = cp.product_id
     where pr.name = l.product and cp.grade = new.grade;
    if v_price is null then
      raise exception 'no price for grade';
    end if;
  end if;
  select collection_fee_rate into v_rate from public.ops_config;
  v_gross := round(v_price * new.recorded_kg, 2);
  v_fee := round(v_gross * v_rate, 2);

  insert into public.settlements (listing_id, farmer_id, lot_id, recorded_kg, grade, price_per_kg, gross, fee_rate, fee, net)
  values (l.id, l.farmer_id, l.lot_id, new.recorded_kg, new.grade, v_price, v_gross, v_rate, v_fee, v_gross - v_fee)
  on conflict (listing_id) do update
    set recorded_kg = excluded.recorded_kg, grade = excluded.grade, price_per_kg = excluded.price_per_kg,
        gross = excluded.gross, fee_rate = excluded.fee_rate, fee = excluded.fee, net = excluded.net, updated_at = now();

  insert into public.notifications (user_id, title, body)
  values (
    l.farmer_id,
    'Your produce was weighed',
    format('%s: %s kg, grade %s. You will receive GHS %s once the buyer has received the lot.',
      l.product, new.recorded_kg, new.grade, to_char(v_gross - v_fee, 'FM999999990.00'))
  );
  return new;
end;
$$;

create trigger captures_settle
after insert or update of recorded_kg, grade on public.captures
for each row execute function private.settle_capture();

-- ── Farmers hear when their lot is bought ───────────────────────────────────
create or replace function private.notify_lot_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state = 'escrow_funded' and old.state = 'escrow_pending' then
    insert into public.notifications (user_id, title, body)
    select l.farmer_id, 'Your produce was bought',
           format('%s kg of %s in lot %s was bought and paid for. Pickup will be scheduled soon.', l.weight_kg, l.product, new.code)
    from public.produce_listings l where l.lot_id = new.id;
  end if;
  return new;
end;
$$;

create trigger lots_notify_paid
after update of state on public.lots
for each row execute function private.notify_lot_paid();

-- ── Plan a route ────────────────────────────────────────────────────────────
drop function if exists public.assign_route(uuid, jsonb, uuid, text);

-- p_stops: [{collection_point_id, start: 'HH:MM', end: 'HH:MM'}]  pickup windows, Accra time
-- p_lots : [{lot_id, start, end}]                                 buyer arrival windows
create or replace function public.plan_route(p_date date, p_agent_id uuid, p_driver_id uuid, p_stops jsonb, p_lots jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (timezone('Africa/Accra', now()))::date;
  rid uuid;
  lot_ids uuid[];
  point_ids uuid[];
  last_pickup timestamptz;
  e jsonb;
  ts timestamptz;
  te timestamptz;
begin
  if not (select private.is_ops()) then raise exception 'ops only'; end if;
  if p_date is null or p_date < today then raise exception 'choose a date from today'; end if;
  if not exists (select 1 from public.profiles where id = p_agent_id and role = 'agent') then raise exception 'choose an agent'; end if;
  if not exists (select 1 from public.profiles where id = p_driver_id and role = 'driver') then raise exception 'choose a driver'; end if;
  if exists (select 1 from public.routes where service_date = p_date and (agent_id = p_agent_id or driver_id = p_driver_id)) then
    raise exception 'agent or driver already has a route that day';
  end if;
  if jsonb_typeof(p_lots) is distinct from 'array' or jsonb_array_length(p_lots) = 0 then raise exception 'choose at least one lot'; end if;
  if jsonb_typeof(p_stops) is distinct from 'array' or jsonb_array_length(p_stops) = 0 then raise exception 'choose at least one stop'; end if;

  select array_agg((value->>'lot_id')::uuid) into lot_ids from jsonb_array_elements(p_lots);
  -- Lock the lots so the same paid lot can't land on two routes.
  perform 1 from public.lots where id = any (lot_ids) and state = 'escrow_funded' for update;
  if (select count(*) from public.lots where id = any (lot_ids) and state = 'escrow_funded') <> cardinality(lot_ids)
     or cardinality(lot_ids) <> (select count(distinct x) from unnest(lot_ids) x) then
    raise exception 'lots must be paid and not yet on a route';
  end if;

  if exists (select 1 from public.produce_listings where lot_id = any (lot_ids) and collection_point_id is null) then
    raise exception 'a listing has no collection point';
  end if;
  select array_agg(distinct collection_point_id) into point_ids from public.produce_listings where lot_id = any (lot_ids);
  if (select array_agg((value->>'collection_point_id')::uuid order by (value->>'collection_point_id')::uuid) from jsonb_array_elements(p_stops))
     is distinct from (select array_agg(x order by x) from unnest(point_ids) x) then
    raise exception 'stops must match the lots'' collection points';
  end if;

  insert into public.routes (agent_id, driver_id, service_date, created_by) values (p_agent_id, p_driver_id, p_date, uid) returning id into rid;

  for e in select value from jsonb_array_elements(p_stops) loop
    if e->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or e->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'enter times as HH:MM'; end if;
    ts := ((p_date::text || ' ' || (e->>'start'))::timestamp) at time zone 'Africa/Accra';
    te := ((p_date::text || ' ' || (e->>'end'))::timestamp) at time zone 'Africa/Accra';
    if te <= ts then raise exception 'a window must end after it starts'; end if;
    insert into public.route_stops (route_id, collection_point_id, window_start, window_end)
    values (rid, (e->>'collection_point_id')::uuid, ts, te);
  end loop;
  -- Stops run in the order of their pickup windows.
  update public.route_stops s set position = o.n
    from (select id, row_number() over (order by window_start, id) n from public.route_stops where route_id = rid) o
   where s.id = o.id;
  select max(window_end) into last_pickup from public.route_stops where route_id = rid;

  for e in select value from jsonb_array_elements(p_lots) loop
    if e->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or e->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'enter times as HH:MM'; end if;
    ts := ((p_date::text || ' ' || (e->>'start'))::timestamp) at time zone 'Africa/Accra';
    te := ((p_date::text || ' ' || (e->>'end'))::timestamp) at time zone 'Africa/Accra';
    if te <= ts then raise exception 'a window must end after it starts'; end if;
    if ts < last_pickup then raise exception 'delivery must be after the last pickup'; end if;
    insert into public.route_lots (route_id, lot_id, window_start, window_end) values (rid, (e->>'lot_id')::uuid, ts, te);
  end loop;

  update public.lots set state = 'collecting' where id = any (lot_ids);

  insert into public.notifications (user_id, title, body)
  select l.farmer_id, 'Pickup scheduled',
         format('%s kg of %s will be collected at %s on %s, between %s and %s.',
           l.weight_kg, l.product, cp.name,
           to_char(s.window_start at time zone 'Africa/Accra', 'Dy DD Mon'),
           to_char(s.window_start at time zone 'Africa/Accra', 'HH24:MI'),
           to_char(s.window_end at time zone 'Africa/Accra', 'HH24:MI'))
  from public.produce_listings l
  join public.route_stops s on s.route_id = rid and s.collection_point_id = l.collection_point_id
  join public.collection_points cp on cp.id = l.collection_point_id
  where l.lot_id = any (lot_ids);

  return rid;
end;
$$;

-- Only a route nobody has started: no arrival and no capture. Its lots go back to paid, unrouted.
create or replace function public.cancel_route(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_ops()) then raise exception 'ops only'; end if;
  perform 1 from public.routes where id = p_route_id for update;
  if not found
     or exists (select 1 from public.route_stops where route_id = p_route_id and (arrived_at is not null or confirmed_at is not null))
     or exists (
       select 1 from public.route_lots rl join public.produce_listings l on l.lot_id = rl.lot_id
       join public.captures c on c.listing_id = l.id where rl.route_id = p_route_id) then
    raise exception 'route cannot be cancelled';
  end if;
  update public.lots set state = 'escrow_funded' where id in (select lot_id from public.route_lots where route_id = p_route_id);
  delete from public.routes where id = p_route_id;
end;
$$;

-- ── Agent / driver steps on the new stop shape ──────────────────────────────
create or replace function public.confirm_stop(p_stop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (timezone('Africa/Accra', now()))::date;
  st record;
begin
  if not (select private.is_agent()) then raise exception 'agent only'; end if;
  if not exists (
    select 1 from public.route_stops s join public.routes r on r.id = s.route_id
    where s.id = p_stop_id and r.agent_id = (select auth.uid()) and r.service_date = today
  ) then
    raise exception 'stop not on your route';
  end if;
  select * into st from private.stop_stats(p_stop_id);
  if st.farmers = 0 or st.captured <> st.farmers then raise exception 'capture every farmer first'; end if;
  update public.route_stops set confirmed_at = now() where id = p_stop_id;
end;
$$;

create or replace function public.depart_stop(p_stop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (timezone('Africa/Accra', now()))::date;
  rid uuid;
  arrived timestamptz;
  temp numeric;
  confirmed timestamptz;
  st record;
begin
  if not (select private.is_driver()) then raise exception 'driver only'; end if;
  select s.route_id, s.arrived_at, s.temperature_c, s.confirmed_at into rid, arrived, temp, confirmed
  from public.route_stops s join public.routes r on r.id = s.route_id
  where s.id = p_stop_id and r.driver_id = uid and r.service_date = today and r.delivered_at is null;
  if rid is null then raise exception 'stop not on your route'; end if;
  if arrived is null then raise exception 'arrive first'; end if;
  if temp is null then raise exception 'log the temperature'; end if;
  select * into st from private.stop_stats(p_stop_id);
  if confirmed is null or st.farmers = 0 or st.captured <> st.farmers then raise exception 'lot not ready'; end if;

  update public.route_stops set departed_at = coalesce(departed_at, now()) where id = p_stop_id;
  -- Last stop loaded: every lot on the route is now on the truck.
  if not exists (select 1 from public.route_stops where route_id = rid and departed_at is null) then
    update public.lots set state = 'in_transit'
     where state = 'collecting' and id in (select lot_id from public.route_lots where route_id = rid);
  end if;
end;
$$;

drop function if exists public.complete_delivery(uuid, text, text);

-- One lot at a time: the driver hands each lot to its buyer. That is what makes the farmers' settlements payable.
create or replace function public.complete_lot_delivery(p_route_id uuid, p_lot_id uuid, p_receiver text, p_photo_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (timezone('Africa/Accra', now()))::date;
  name text := btrim(coalesce(p_receiver, ''));
  lot_code text;
begin
  if not (select private.is_driver()) then raise exception 'driver only'; end if;
  if char_length(name) < 2 then raise exception 'enter the receiver name'; end if;
  if p_photo_path is null or p_photo_path not like (uid::text || '/%') then raise exception 'take a photograph'; end if;
  if exists (select 1 from public.route_stops where route_id = p_route_id and departed_at is null) then
    raise exception 'finish every stop first';
  end if;

  update public.route_lots rl
     set received_by = name, delivery_photo_path = p_photo_path, delivered_at = now()
    from public.routes r
   where rl.route_id = r.id and r.id = p_route_id and rl.lot_id = p_lot_id
     and r.driver_id = uid and r.service_date = today and rl.delivered_at is null;
  if not found then raise exception 'lot not on your route'; end if;

  update public.lots set state = 'delivered' where id = p_lot_id returning lots.code into lot_code;
  update public.settlements set status = 'payable', payable_at = now() where lot_id = p_lot_id and status = 'pending';

  insert into public.notifications (user_id, title, body)
  select farmer_id, 'Produce delivered',
         format('Lot %s reached the buyer. GHS %s for %s is now payable to you.', lot_code, to_char(net, 'FM999999990.00'), (select product from public.produce_listings where id = listing_id))
  from public.settlements where lot_id = p_lot_id;

  if not exists (select 1 from public.route_lots where route_id = p_route_id and delivered_at is null) then
    update public.routes set delivered_at = now() where id = p_route_id;
  end if;
end;
$$;

revoke all on function public.plan_route(date, uuid, uuid, jsonb, jsonb), public.cancel_route(uuid),
  public.complete_lot_delivery(uuid, uuid, text, text) from public, anon;
grant execute on function public.plan_route(date, uuid, uuid, jsonb, jsonb), public.cancel_route(uuid),
  public.complete_lot_delivery(uuid, uuid, text, text) to authenticated;

-- One payload for the driver dashboard.
create or replace function public.driver_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (timezone('Africa/Accra', now()))::date;
  result jsonb;
begin
  if not (select private.is_driver()) then raise exception 'driver only'; end if;

  select jsonb_build_object(
    'id', r.id,
    'plate', d.plate_number,
    'deliveredAt', r.delivered_at,
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'pointName', cp.name,
        'locality', coalesce(cp.locality, ''),
        'windowStart', s.window_start,
        'windowEnd', s.window_end,
        'products', (
          select coalesce(jsonb_agg(distinct l.product), '[]'::jsonb) from public.route_lots rl
          join public.produce_listings l on l.lot_id = rl.lot_id
          where rl.route_id = r.id and l.collection_point_id = s.collection_point_id),
        'farmers', st.farmers, 'listedKg', st.listed_kg, 'captured', st.captured, 'capturedKg', st.captured_kg,
        'confirmed', s.confirmed_at is not null,
        'arrivedAt', s.arrived_at, 'temperatureC', s.temperature_c, 'departedAt', s.departed_at
      ) order by s.position, cp.name)
      from public.route_stops s
      join public.collection_points cp on cp.id = s.collection_point_id
      cross join lateral private.stop_stats(s.id) st
      where s.route_id = r.id
    ), '[]'::jsonb),
    'deliveries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'lotId', lot.id, 'code', lot.code, 'product', lot.product, 'expectedKg', lot.total_kg,
        'buyer', b.organization_name, 'location', b.delivery_location,
        'windowStart', rl.window_start, 'windowEnd', rl.window_end,
        'deliveredAt', rl.delivered_at, 'receivedBy', rl.received_by
      ) order by rl.window_start, lot.code)
      from public.route_lots rl
      join public.lots lot on lot.id = rl.lot_id
      left join public.orders o on o.lot_id = lot.id and o.state = 'paid'
      left join public.buyers b on b.id = o.buyer_id
      where rl.route_id = r.id
    ), '[]'::jsonb)
  )
  into result
  from public.routes r
  left join public.drivers d on d.id = r.driver_id
  where r.driver_id = uid and r.service_date = today;

  return result;
end;
$$;

-- ── Buyer tracking: capture -> collection -> delivery, with the agent's photographs ──
create or replace function public.buyer_tracking()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_buyer()) then raise exception 'buyers only'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'orderId', o.id,
      'lotState', lot.state,
      'expectedKg', lot.total_kg,
      'farmers', (select count(*) from public.produce_listings l where l.lot_id = lot.id),
      'captured', (select count(*) from public.produce_listings l join public.captures c on c.listing_id = l.id where l.lot_id = lot.id),
      'capturedKg', (select coalesce(sum(c.recorded_kg), 0) from public.produce_listings l join public.captures c on c.listing_id = l.id where l.lot_id = lot.id),
      'captures', (select coalesce(jsonb_agg(jsonb_build_object('path', c.photo_path, 'kg', c.recorded_kg, 'grade', c.grade) order by c.updated_at), '[]'::jsonb)
                   from public.produce_listings l join public.captures c on c.listing_id = l.id where l.lot_id = lot.id),
      'pickupStart', (select min(s.window_start) from public.route_stops s where s.route_id = rl.route_id
                      and s.collection_point_id in (select collection_point_id from public.produce_listings where lot_id = lot.id)),
      'pickupEnd', (select max(s.window_end) from public.route_stops s where s.route_id = rl.route_id
                    and s.collection_point_id in (select collection_point_id from public.produce_listings where lot_id = lot.id)),
      'deliveryStart', rl.window_start,
      'deliveryEnd', rl.window_end,
      'deliveredAt', rl.delivered_at
    ))
    from public.orders o
    join public.lots lot on lot.id = o.lot_id
    left join public.route_lots rl on rl.lot_id = lot.id
    where o.buyer_id = (select auth.uid()) and o.state = 'paid'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.driver_today(), public.buyer_tracking() from public, anon;
grant execute on function public.driver_today(), public.buyer_tracking() to authenticated;

-- ── Farmer listings: sold, scheduled pickup, weighed result and settlement ──
drop function if exists public.farmer_listings();

create function public.farmer_listings()
returns table (
  id uuid, product text, weight_kg numeric, created_at timestamptz, grade text, image_paths text[],
  est_net numeric, est_fee numeric, point text, recorded_kg numeric, stage text, in_lot boolean, lot_code text,
  recorded_grade text, pickup_start timestamptz, pickup_end timestamptz, settlement_net numeric, settlement_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id, l.product, l.weight_kg, l.created_at, l.grade, l.image_paths, l.est_net, l.est_fee, cp.name, c.recorded_kg,
    case
      when rl.delivered_at is not null then 'delivered'
      when s.departed_at is not null then 'loaded'
      when c.listing_id is not null then 'captured'
      when s.id is not null then 'scheduled'
      when lot.state = 'escrow_funded' then 'sold'
      else 'available'
    end,
    l.lot_id is not null,
    lot.code,
    c.grade, s.window_start, s.window_end, st.net, st.status
  from public.produce_listings l
  left join public.collection_points cp on cp.id = l.collection_point_id
  left join public.captures c on c.listing_id = l.id
  left join public.lots lot on lot.id = l.lot_id
  left join public.route_lots rl on rl.lot_id = l.lot_id
  left join public.route_stops s on s.route_id = rl.route_id and s.collection_point_id = l.collection_point_id
  left join public.settlements st on st.listing_id = l.id
  where l.farmer_id = (select auth.uid())
  order by l.created_at desc;
$$;

revoke all on function public.farmer_listings() from public, anon;
grant execute on function public.farmer_listings() to authenticated;

comment on table public.route_lots is 'A paid lot on a route, with the buyer''s delivery window and proof of delivery.';
comment on table public.settlements is 'What a farmer is owed for one captured listing. Payable only once the lot is delivered.';
