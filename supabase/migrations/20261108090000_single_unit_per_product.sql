-- One unit and one price per product (replaces the per-product list of units from 20261107090000).
-- Why: stock, holds, allocations, driver checks and payouts must all count in one unit that can be weighed or counted.
-- Each product keeps its own unit (kg, bunch, egg, ...); the base price is set once for that unit, and buyer and
-- farmer prices are still derived from it with ops_config.buyer_markup_pct / farmer_discount_pct.
--
-- Existing data is converted, not wiped: a product's unit becomes its first active unit (else its first unit, else 'kg')
-- and its base price comes from that unit. Listings or order lines recorded in any other unit are kept as history but
-- no longer match anything for sale. Products that had no active unit have no price, so they are not for sale until
-- ops set one. Not reversible without restoring product_units from a backup.

-- ── The unit moves onto the product ─────────────────────────────────────────
alter table public.products add column unit text;

update public.products p
   set unit = u.unit
  from (select distinct on (product_id) product_id, unit
          from public.product_units
         order by product_id, active desc, sort, unit) u
 where u.product_id = p.id;
update public.products set unit = 'kg' where unit is null;

alter table public.products alter column unit set not null;
alter table public.products
  add constraint products_unit_check check (unit = btrim(unit) and char_length(unit) between 1 and 40);
comment on column public.products.unit is 'The one unit this product is listed, ordered, collected and paid in. Quantities everywhere are in this unit.';

-- ── Base price, ops-only (public readers of products must not see it) ───────
create table public.product_prices (
  product_id uuid primary key references public.products (id) on delete cascade,
  price numeric(10, 2) not null check (price > 0 and price <= 100000),
  prev_price numeric(10, 2),
  updated_at timestamptz not null default now()
);

-- Copied before the trigger exists so the existing previous price is kept.
insert into public.product_prices (product_id, price, prev_price, updated_at)
select p.id, u.price, u.prev_price, u.updated_at
  from public.products p
  join public.product_units u on u.product_id = p.id and u.unit = p.unit and u.active;

create trigger product_prices_track_change
before insert or update on public.product_prices
for each row execute function private.track_price_change();

alter table public.product_prices enable row level security;
revoke all on table public.product_prices from anon, authenticated;
grant select, insert, update, delete on table public.product_prices to authenticated;
create policy product_prices_ops_all on public.product_prices for all to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));
comment on table public.product_prices is 'Base price per product (in products.unit). Buyer and farmer prices are derived from it using ops_config.';

-- ── Unit guard moves to products ────────────────────────────────────────────
drop table public.product_units;
drop function private.guard_unit_change();

-- Listings and orders match on the unit text, so it cannot change once either exists for the product.
create function private.guard_unit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit is distinct from old.unit and (
       exists (select 1 from public.produce_listings l where lower(btrim(l.product)) = lower(btrim(old.name)))
    or exists (select 1 from public.order_items i where i.product_id = old.id)) then
    raise exception 'this product already has listings or orders in its unit, so the unit cannot change';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_unit_change() from public, anon, authenticated;

create trigger products_unit_guard
before update of unit on public.products
for each row execute function private.guard_unit_change();

-- ── Functions now read products.unit and product_prices ─────────────────────

create or replace function public.estimate_listing(p_product text, p_kg numeric, p_unit text)
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
  select private.farmer_price(pp.price) into v_price
    from public.product_prices pp
    join public.products pr on pr.id = pp.product_id
   where pr.name = p_product and pr.active and pr.unit = p_unit;
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

drop function if exists public.buyer_catalogue();
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
    p.unit,
    private.buyer_price(pp.price),
    private.available_kg(p.id, p.unit)
  from public.product_prices pp
  join public.products p on p.id = pp.product_id and p.active
  join public.categories c on c.id = p.category_id and c.active
  where (select private.is_buyer()) or (select private.is_ops())
  order by p.created_at desc, p.id;
$$;
revoke all on function public.buyer_catalogue() from public, anon;
grant execute on function public.buyer_catalogue() to authenticated;

drop function if exists public.price_board();
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
  select p.id, p.name, p.aliases, c.name, p.image_path, p.unit,
         private.farmer_price(pp.price),
         case when pp.prev_price is null then null else private.farmer_price(pp.prev_price) end,
         pp.updated_at
    from public.product_prices pp
    join public.products p on p.id = pp.product_id and p.active
    left join public.categories c on c.id = p.category_id
   order by p.name;
$$;
revoke all on function public.price_board() from public;
grant execute on function public.price_board() to anon, authenticated;

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
    join public.product_prices pu on pu.product_id = i.product_id
    join public.products p on p.id = i.product_id and p.active and p.unit = i.unit
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
