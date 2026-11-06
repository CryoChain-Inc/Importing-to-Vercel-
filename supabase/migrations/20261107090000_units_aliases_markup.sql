-- Units replace grades. Each product has ops-managed units (kg, crate, bunch...), each with a base price.
-- Buyer price = base x (1 + buyer_markup_pct / 100); farmer price = base x (1 - farmer_discount_pct / 100); both live in ops_config.
-- Products also get alias names for search. Quantity columns are still called kg; they now mean "quantity in the row's unit".
--
-- DESTRUCTIVE: wipes products, prices, listings, carts, orders, payments, allocations, deliveries and payouts.
-- Users, profiles, categories, ops_config and trucks are kept. Not reversible; prototype data only.

truncate table public.orders, public.produce_listings, public.products, public.payout_runs cascade;
delete from public.ops_decisions;

-- ── Aliases and units ───────────────────────────────────────────────────────
alter table public.products
  add column aliases text not null default '' check (char_length(aliases) <= 500);
comment on column public.products.aliases is 'Comma-separated local or alternative names, matched by search.';

create table public.product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  unit text not null,
  price numeric(10, 2) not null check (price > 0 and price <= 100000),
  prev_price numeric(10, 2),
  active boolean not null default true,
  sort smallint not null default 0,
  updated_at timestamptz not null default now(),
  unique (product_id, unit),
  constraint product_units_unit_len check (unit = btrim(unit) and char_length(unit) between 1 and 40)
);

create trigger product_units_track_change
before insert or update on public.product_units
for each row execute function private.track_price_change();

-- A unit that listings or orders already use cannot be renamed or deleted (they match on the unit text); switch it off instead.
create function private.guard_unit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.unit = old.unit and new.product_id = old.product_id then
    return new;
  end if;
  if exists (
       select 1 from public.produce_listings l
         join public.products p on p.id = old.product_id
        where lower(btrim(l.product)) = lower(btrim(p.name)) and l.unit = old.unit)
     or exists (select 1 from public.order_items i where i.product_id = old.product_id and i.unit = old.unit) then
    raise exception 'this unit is already used by listings or orders, so switch it off instead';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.guard_unit_change() from public, anon, authenticated;

alter table public.product_units enable row level security;
revoke all on table public.product_units from anon, authenticated;
grant select, insert, update, delete on table public.product_units to authenticated;
create policy product_units_ops_all on public.product_units for all to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));
comment on table public.product_units is 'Per-product sale units with a base price. Farmers and buyers read derived prices through price_board() and buyer_catalogue() only.';

-- ── Pricing percentages ─────────────────────────────────────────────────────
alter table public.ops_config
  add column buyer_markup_pct numeric(5, 2) not null default 20 check (buyer_markup_pct between 0 and 100),
  add column farmer_discount_pct numeric(5, 2) not null default 20 check (farmer_discount_pct between 0 and 90);

create function private.buyer_price(p_base numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(p_base * (1 + c.buyer_markup_pct / 100), 2) from public.ops_config c limit 1;
$$;

create function private.farmer_price(p_base numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(p_base * (1 - c.farmer_discount_pct / 100), 2) from public.ops_config c limit 1;
$$;
revoke all on function private.buyer_price(numeric), private.farmer_price(numeric) from public, anon, authenticated;

-- ── Grade -> unit on every table that keyed on it ───────────────────────────
alter table public.produce_listings drop column grade, add column unit text not null check (unit = btrim(unit) and char_length(unit) between 1 and 40);
alter table public.supply_holds drop column grade, add column unit text not null;
alter table public.cart_lines drop column grade, add column unit text not null;
alter table public.order_items drop column grade, add column unit text not null;
alter table public.order_allocations drop column grade, add column unit text not null;
alter table public.delivery_handovers drop column grade;

alter table public.cart_lines add primary key (buyer_id, product_id, unit);
alter table public.order_items add unique (order_id, product_id, unit);
create index supply_holds_live_idx on public.supply_holds (product_id, unit) where state <> 'released';

create trigger product_units_guard
before update of unit, product_id or delete on public.product_units
for each row execute function private.guard_unit_change();

drop function private.available_kg(uuid, text);
create or replace function private.available_kg(p_product_id uuid, p_unit text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0,
    coalesce((
      select sum(l.weight_kg)
      from public.produce_listings l
      join public.products p on lower(btrim(p.name)) = lower(btrim(l.product))
      where p.id = p_product_id
        and l.unit = p_unit
        and l.lot_id is null
        and not exists (select 1 from public.captures c where c.listing_id = l.id)
    ), 0)
    - coalesce((
      select sum(h.kg)
      from public.supply_holds h
      where h.product_id = p_product_id
        and h.unit = p_unit
        and (h.state = 'committed' or (h.state = 'held' and h.expires_at > now()))
    ), 0)
    - coalesce((
      select sum(a.kg)
      from public.order_allocations a
      where a.product_id = p_product_id
        and a.unit = p_unit
        and a.status in ('declined', 'expired')
    ), 0)
  );
$$;
revoke all on function private.available_kg(uuid, text) from public, anon, authenticated;

drop function public.estimate_listing(text, numeric, text);
create function public.estimate_listing(p_product text, p_kg numeric, p_unit text)
returns table (price_per_kg numeric, gross numeric, fee_rate numeric, fee numeric, net numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_price numeric;
  v_rate numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in';
  end if;
  select private.farmer_price(pu.price) into v_price
    from public.product_units pu
    join public.products pr on pr.id = pu.product_id
   where pr.name = p_product and pr.active and pu.active and pu.unit = p_unit;
  if v_price is null then
    return;
  end if;
  select c.collection_fee_rate into v_rate from public.ops_config c;
  price_per_kg := v_price;
  gross := round(v_price * p_kg, 2);
  fee_rate := v_rate;
  fee := round(gross * v_rate, 2);
  net := gross - fee;
  return next;
end;
$$;
revoke all on function public.estimate_listing(text, numeric, text) from public, anon;
grant execute on function public.estimate_listing(text, numeric, text) to authenticated;

create or replace function private.stamp_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  p text;
begin
  if cardinality(new.image_paths) not between 3 and 6 then
    raise exception 'add 3 to 6 photos';
  end if;
  foreach p in array new.image_paths loop
    if p not like new.farmer_id::text || '/%' then
      raise exception 'invalid photo path';
    end if;
  end loop;
  select * into e from public.estimate_listing(new.product, new.weight_kg, new.unit);
  if e.price_per_kg is null then
    raise exception 'no published price for this product and unit';
  end if;
  new.est_price_per_kg := e.price_per_kg;
  new.est_gross := e.gross;
  new.est_fee_rate := e.fee_rate;
  new.est_fee := e.fee;
  new.est_net := e.net;
  return new;
end;
$$;

drop function public.update_own_listing(uuid, text, text, numeric);
create or replace function public.update_own_listing(p_id uuid, p_product text, p_unit text, p_weight_kg numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  l public.produce_listings;
  committed numeric;
  e record;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select * into l from public.produce_listings where id = p_id and farmer_id = uid for update;
  if not found then
    raise exception 'listing not found';
  end if;
  if l.lot_id is not null then
    raise exception 'already in a lot';
  end if;
  if private.lot_is_delivered(l.lot_id) or exists (
    select 1 from public.order_allocations a
     where a.listing_id = p_id and private.order_is_delivered(a.order_id)
  ) then
    raise exception 'this produce has been delivered, so it can no longer be edited';
  end if;
  if p_unit is null or char_length(btrim(p_unit)) not between 1 and 40 then
    raise exception 'invalid unit';
  end if;
  if p_weight_kg is null or p_weight_kg <= 0 or p_weight_kg >= 100000000 then
    raise exception 'invalid weight';
  end if;
  if not exists (select 1 from public.products p where p.name = btrim(p_product) and p.active) then
    raise exception 'unknown product';
  end if;

  select coalesce(sum(a.kg), 0) into committed
    from public.order_allocations a
   where a.listing_id = p_id and a.status in ('offered', 'accepted', 'collected', 'declined', 'expired');
  if committed > 0 and (btrim(p_product) <> l.product or p_unit <> l.unit) then
    raise exception 'part of this listing is already sold, so the product and unit cannot change';
  end if;
  if p_weight_kg < committed then
    raise exception 'weight cannot be below the % kg already sold', committed;
  end if;

  select * into e from public.estimate_listing(btrim(p_product), p_weight_kg, p_unit);
  if e.price_per_kg is null then
    raise exception 'no published price for this product and unit';
  end if;
  update public.produce_listings
     set product = btrim(p_product),
         unit = p_unit,
         weight_kg = p_weight_kg,
         est_price_per_kg = e.price_per_kg,
         est_gross = e.gross,
         est_fee_rate = e.fee_rate,
         est_fee = e.fee,
         est_net = e.net
   where id = p_id and farmer_id = uid;
end;
$$;
revoke all on function public.update_own_listing(uuid, text, text, numeric) from public, anon;
grant execute on function public.update_own_listing(uuid, text, text, numeric) to authenticated;

drop function public.buyer_catalogue();
create function public.buyer_catalogue()
returns table (
  product_id uuid,
  product_name text,
  product_aliases text,
  product_image text,
  product_images text[],
  product_description text,
  category_id uuid,
  category_name text,
  category_image text,
  unit text,
  price numeric,
  available_kg numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.aliases,
    p.image_path,
    p.image_paths,
    p.description,
    c.id,
    c.name,
    c.image_path,
    pu.unit,
    private.buyer_price(pu.price),
    private.available_kg(p.id, pu.unit)
  from public.product_units pu
  join public.products p on p.id = pu.product_id and p.active
  join public.categories c on c.id = p.category_id and c.active
  where pu.active and ((select private.is_buyer()) or (select private.is_ops()))
  order by p.created_at desc, p.id, pu.sort, pu.unit;
$$;
revoke all on function public.buyer_catalogue() from public, anon;
grant execute on function public.buyer_catalogue() to authenticated;

-- Farmer-facing prices and unit options (also the public price board). Buyer prices never appear here.
create function public.price_board()
returns table (
  product_id uuid,
  product_name text,
  aliases text,
  category_name text,
  image_path text,
  unit text,
  price numeric,
  prev_price numeric,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.aliases, c.name, p.image_path, pu.unit,
         private.farmer_price(pu.price),
         case when pu.prev_price is null then null else private.farmer_price(pu.prev_price) end,
         pu.updated_at
    from public.product_units pu
    join public.products p on p.id = pu.product_id and p.active
    left join public.categories c on c.id = p.category_id
   where pu.active
   order by p.name, pu.sort, pu.unit;
$$;
revoke all on function public.price_board() from public;
grant execute on function public.price_board() to anon, authenticated;

create or replace function public.save_cart(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if not (select private.is_buyer()) then
    raise exception 'buyers only';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'cart must have 0 to 50 items';
  end if;

  delete from public.cart_lines where buyer_id = uid;
  insert into public.cart_lines (buyer_id, product_id, unit, kg)
  select distinct on (i.product_id, i.unit) uid, i.product_id, i.unit, i.kg
    from jsonb_to_recordset(p_items) as i(product_id uuid, unit text, kg numeric)
   where char_length(btrim(i.unit)) between 1 and 40 and i.kg > 0 and i.kg <= 30000
     and exists (select 1 from public.products p where p.id = i.product_id)
   order by i.product_id, i.unit;
end;
$$;

create or replace function public.checkout_cart(p_items jsonb, p_address_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  addr public.buyer_addresses;
  line record;
  avail numeric;
  lines jsonb;
  shortfalls jsonb := '[]'::jsonb;
  new_id uuid;
  total numeric(12, 2);
  -- shortcut: fixed 30 minute hold (matches the Paystack pending window), move to ops_config if ops need to tune it.
  hold_until timestamptz := now() + interval '30 minutes';
begin
  if not (select private.is_buyer()) then
    raise exception 'buyers only';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'cart must have 1 to 50 items';
  end if;

  select * into addr from public.buyer_addresses where id = p_address_id and buyer_id = uid;
  if not found then
    raise exception 'choose a delivery address';
  end if;
  if addr.latitude is null then
    raise exception 'pin your delivery address on the map first';
  end if;

  -- Merge duplicate lines and price them; a line that is not for sale makes the whole cart invalid.
  select jsonb_agg(jsonb_build_object('product_id', q.product_id, 'unit', q.unit, 'kg', q.kg, 'price', q.price)
                   order by q.product_id, q.unit)
    into lines
  from (
    select i.product_id, i.unit, sum(i.kg) as kg, private.buyer_price(pu.price) as price
    from jsonb_to_recordset(p_items) as i(product_id uuid, unit text, kg numeric)
    join public.product_units pu on pu.product_id = i.product_id and pu.unit = i.unit and pu.active
    join public.products p on p.id = i.product_id and p.active
    where i.kg > 0 and i.kg <= 30000
    group by i.product_id, i.unit, pu.price
  ) q;

  if lines is null or jsonb_array_length(lines) <> (
       select count(distinct (i.product_id, i.unit)) from jsonb_to_recordset(p_items) as i(product_id uuid, unit text, kg numeric)) then
    raise exception 'an item in your cart is not for sale';
  end if;

  -- Serialize checkouts per product+unit; lines are sorted so two carts cannot deadlock.
  for line in select * from jsonb_to_recordset(lines) as x(product_id uuid, unit text, kg numeric, price numeric) loop
    perform pg_advisory_xact_lock(hashtextextended(line.product_id::text || line.unit, 0));
  end loop;

  for line in select * from jsonb_to_recordset(lines) as x(product_id uuid, unit text, kg numeric, price numeric) loop
    avail := private.available_kg(line.product_id, line.unit);
    if line.kg > avail then
      shortfalls := shortfalls || jsonb_build_object(
        'product_id', line.product_id, 'unit', line.unit, 'requested_kg', line.kg, 'available_kg', avail);
    end if;
  end loop;
  if jsonb_array_length(shortfalls) > 0 then
    return jsonb_build_object('ok', false, 'shortfalls', shortfalls);
  end if;

  select round(sum(x.kg * x.price), 2) into total
    from jsonb_to_recordset(lines) as x(product_id uuid, unit text, kg numeric, price numeric);
  insert into public.orders (buyer_id, amount, delivery_address_id, delivery_address, delivery_lat, delivery_lng)
  values (uid, total, addr.id, addr.address, addr.latitude, addr.longitude)
  returning id into new_id;

  insert into public.order_items (order_id, product_id, unit, kg, unit_price, line_total)
  select new_id, x.product_id, x.unit, x.kg, x.price, round(x.kg * x.price, 2)
    from jsonb_to_recordset(lines) as x(product_id uuid, unit text, kg numeric, price numeric);
  insert into public.supply_holds (order_id, product_id, unit, kg, expires_at)
  select new_id, x.product_id, x.unit, x.kg, hold_until
    from jsonb_to_recordset(lines) as x(product_id uuid, unit text, kg numeric, price numeric);

  return jsonb_build_object('ok', true, 'order_id', new_id);
end;
$$;

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
  -- shortcut: every pickup is 08:00 the next day in Accra; replace with a driver ETA once routes carry one.
  pick timestamptz := (((now() at time zone 'Africa/Accra')::date + 1) + time '08:00') at time zone 'Africa/Accra';
  pick_txt text := to_char(pick at time zone 'Africa/Accra', 'FMDay DD Mon') || ' from 08:00';
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

    select private.farmer_price(pu.price) into fprice from public.product_units pu
     where pu.product_id = item.product_id and pu.unit = item.unit and pu.active;
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

      insert into public.order_allocations (order_id, product_id, listing_id, farmer_id, unit, kg, farmer_price, amount, km_to_buyer, status, pickup_at)
      values (ord.id, item.product_id, cand.listing_id, cand.farmer_id, item.unit, take, fprice, pay, round(cand.km_buyer, 1), 'accepted', pick)
      returning id into alloc_id;

      -- Farmers see what to supply and what they earn, never who the buyer is.
      insert into public.notifications (user_id, title, body)
      values (cand.farmer_id, 'Pickup scheduled',
        format('We will collect %s %s of %s from your farm on %s. You earn GH₵ %s once it is collected.', take, item.unit, item.name, pick_txt, to_char(pay, 'FM999G999G990D00')));

      select pr.phone into fphone from public.profiles pr where pr.id = cand.farmer_id;
      insert into public.sms_outbox (user_id, allocation_id, phone, body, status, error)
      values (cand.farmer_id, alloc_id, fphone,
        format('CryoChain: pickup scheduled. We will collect %s %s of %s from your farm on %s. You earn GHS %s once collected.', take, item.unit, item.name, pick_txt, to_char(pay, 'FM999G999G990D00')),
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

create or replace function private.plan_routes()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  drv record;
  nxt record;
  chosen uuid;
  cur_lat numeric;
  cur_lng numeric;
  n integer;
begin
  perform pg_advisory_xact_lock(7001);

  delete from public.delivery_stops s
   where s.state = 'pending' and s.kind = 'pickup'
     and not exists (select 1 from public.order_allocations a where a.id = s.allocation_id and a.status in ('offered', 'accepted'));
  delete from public.delivery_stops s
   where s.state = 'pending' and s.kind = 'dropoff'
     and not exists (select 1 from public.order_allocations a where a.order_id = s.order_id and a.status in ('offered', 'accepted', 'collected'));

  insert into public.delivery_stops (order_id, allocation_id, kind, label, lat, lng)
  select a.order_id, a.id, 'pickup',
         'Pick up ' || a.kg::text || ' ' || a.unit || ' ' || p.name || ' · ' || coalesce(nullif(f.locality, ''), 'farm'),
         f.latitude::numeric(9, 6), f.longitude::numeric(9, 6)
    from public.order_allocations a
    join public.products p on p.id = a.product_id
    join public.farmers f on f.id = a.farmer_id
   where a.status in ('offered', 'accepted') and f.latitude is not null
     and not exists (select 1 from public.delivery_stops s where s.allocation_id = a.id);

  insert into public.delivery_stops (order_id, kind, label, lat, lng)
  select ord.id, 'dropoff', 'Deliver ' || ord.code || ' · ' || coalesce(ord.delivery_address, 'buyer'),
         ord.delivery_lat::numeric(9, 6), ord.delivery_lng::numeric(9, 6)
    from public.orders ord
   where ord.state = 'paid' and ord.delivery_lat is not null
     and exists (select 1 from public.order_allocations a where a.order_id = ord.id and a.status in ('offered', 'accepted', 'collected'))
     and not exists (select 1 from public.delivery_stops s where s.order_id = ord.id and s.kind = 'dropoff');

  for o in
    select s.order_id from public.delivery_stops s
     where s.driver_id is null and s.state = 'pending'
     group by s.order_id order by min(s.created_at)
  loop
    select d.id into chosen
      from public.drivers d
      join public.driver_locations dl on dl.driver_id = d.id and dl.updated_at > now() - interval '30 minutes'
      left join lateral (
        select s.lat, s.lng from public.delivery_stops s
         where s.order_id = o.order_id and s.kind = 'pickup' and s.state = 'pending'
         order by s.created_at limit 1
      ) fp on true
     order by (select count(*) from public.delivery_stops x where x.driver_id = d.id and x.state = 'pending'),
              private.haversine_km(dl.lat, dl.lng, fp.lat, fp.lng)
     limit 1;

    if chosen is null then
      perform private.raise_decision('no_driver', o.order_id,
        'No driver has shared a location in the last 30 minutes, so this order has no route yet.', o.order_id::text);
    else
      update public.delivery_stops set driver_id = chosen
       where order_id = o.order_id and state = 'pending' and driver_id is null;
      perform private.auto_resolve_decision('no_driver', o.order_id::text, 'Resolved automatically: a driver was assigned.');
    end if;
  end loop;

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
       order by case when cur_lat is null then 0 else private.haversine_km(cur_lat, cur_lng, s.lat, s.lng) end, s.created_at
       limit 1;
      exit when nxt.id is null;
      n := n + 1;
      update public.delivery_stops set seq = n where id = nxt.id;
      cur_lat := nxt.lat;
      cur_lng := nxt.lng;
    end loop;
  end loop;
end;
$$;

create or replace function private.freeze_delivered_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and private.order_is_delivered(new.order_id) then
    raise exception 'this order has been delivered, so it can no longer be changed';
  end if;
  if tg_op = 'UPDATE' and old.delivered_at is not null and (
       new.kg is distinct from old.kg
    or new.unit is distinct from old.unit
    or new.amount is distinct from old.amount
    or new.farmer_price is distinct from old.farmer_price
    or new.farmer_id is distinct from old.farmer_id
    or new.product_id is distinct from old.product_id
    or new.listing_id is distinct from old.listing_id
    or new.status is distinct from old.status
    or new.order_id is distinct from old.order_id
  ) then
    raise exception 'this order has been delivered, so it can no longer be changed';
  end if;
  return new;
end;
$$;

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
                    'recordedKg', h.recorded_kg,
                    'temperatureC', h.temperature_c,
                    'note', coalesce(h.note, ''),
                    'mediaPath', h.media_path,
                    'mediaKind', h.media_kind
                  ) as obj
                from public.delivery_stops s2
                join public.order_allocations a on a.id = s2.allocation_id
                join public.products pr on pr.id = a.product_id
                join public.farmers f on f.id = a.farmer_id
                left join public.profiles fp on fp.id = a.farmer_id
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

drop function public.record_delivery_handover(uuid, numeric, text, numeric, text, text, text);

create function public.record_delivery_handover(
  p_stop uuid,
  p_kg numeric,
  p_celsius numeric,
  p_note text,
  p_media_path text default null,
  p_media_kind text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  s public.delivery_stops;
  lo numeric;
  hi numeric;
  kg numeric := round(p_kg, 2);
  note text := nullif(btrim(coalesce(p_note, '')), '');
  media_path text := nullif(btrim(coalesce(p_media_path, '')), '');
  media_kind text := lower(btrim(coalesce(p_media_kind, '')));
begin
  if uid is null or not (select private.is_driver()) then
    raise exception 'driver only';
  end if;
  if note is not null and char_length(note) > 280 then
    raise exception 'note is too long';
  end if;
  if p_celsius is null or p_celsius < -100 or p_celsius > 100 then
    raise exception 'temperature out of range';
  end if;
  select min_temp_c, max_temp_c into lo, hi from public.ops_config where id;
  if lo is not null and p_celsius < lo then
    raise exception 'temperature out of range';
  end if;
  if hi is not null and p_celsius > hi then
    raise exception 'temperature out of range';
  end if;
  if media_path is null or media_kind not in ('photo', 'video') then
    raise exception 'add a photo or video';
  end if;
  if media_path not like uid::text || '/%' then
    raise exception 'invalid media path';
  end if;

  select * into s from public.delivery_stops where id = p_stop and driver_id = uid for update;
  if not found then
    raise exception 'stop not on your route';
  end if;
  if s.state <> 'pending' then
    raise exception 'this stop has been completed, so it can no longer be changed';
  end if;

  if s.kind = 'pickup' then
    if kg is null or kg <= 0 or kg > 100000 then
      raise exception 'enter the kilos';
    end if;
  else
    kg := null;
  end if;

  insert into public.delivery_handovers (stop_id, driver_id, recorded_kg, temperature_c, note, media_path, media_kind)
  values (s.id, uid, kg, p_celsius, note, media_path, media_kind)
  on conflict (stop_id) do update
    set recorded_kg = excluded.recorded_kg,
        temperature_c = excluded.temperature_c,
        note = excluded.note,
        media_path = excluded.media_path,
        media_kind = excluded.media_kind;
end;
$$;
revoke all on function public.record_delivery_handover(uuid, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.record_delivery_handover(uuid, numeric, numeric, text, text, text) to authenticated;

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
    update public.order_allocations set status = 'collected' where id = s.allocation_id;
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

-- ── Retire the per-grade price tables ───────────────────────────────────────
drop table public.crop_prices, public.buyer_prices;
drop function private.check_grade_order();
