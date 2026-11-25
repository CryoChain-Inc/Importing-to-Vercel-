-- shortfall: a farm that has less than was reserved.
--   * The farmer is paid for what the driver collected (allocation kg and amount become the collected figures).
--   * What was missing stays on the listing as a 'declined' allocation, so it is counted as withdrawn and never resold.
--   * Within ops_config.pickup_tolerance_pct of the line nothing else happens. Beyond it the gap is allocated at once
--     from nearby farms and joins the same truck; what cannot be found is recorded as short for a refund.

alter table public.ops_config
  add column pickup_tolerance_pct numeric(5, 2) not null default 2 check (pickup_tolerance_pct between 0 and 50);

-- Quantity of an order line that will not be delivered: tolerated (no refund) and short (refund due).
alter table public.order_items
  add column tolerated_kg numeric(10, 2) not null default 0 check (tolerated_kg >= 0),
  add column short_kg numeric(10, 2) not null default 0 check (short_kg >= 0);

alter table public.ops_decisions drop constraint ops_decisions_kind_check;
alter table public.ops_decisions add constraint ops_decisions_kind_check
  check (kind in ('no_supply', 'no_farmer_price', 'no_driver', 'sms_failed', 'allocation_error', 'over_capacity', 'short_supply'));

alter table public.delivery_handovers drop constraint delivery_handovers_kg;
alter table public.delivery_handovers add constraint delivery_handovers_kg
  check (recorded_kg is null or (recorded_kg >= 0 and recorded_kg <= 100000));

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
  on_truck uuid;
  detour numeric;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or ord.state <> 'paid' or ord.delivery_lat is null or ord.delivery_lng is null then
    return;
  end if;

  -- Once the order is on a truck (a top-up after a short pickup), only farms near what it still has to drive are used.
  select s.driver_id into on_truck from public.delivery_stops s
   where s.order_id = ord.id and s.state = 'pending' and s.driver_id is not null limit 1;
  select c.detour_km into detour from public.ops_config c where c.id;

  for item in
    select oi.product_id, oi.unit, oi.kg - oi.tolerated_kg - oi.short_kg as kg, p.name
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
         -- A farm that already came up short on this product for this order is not asked again.
         and not exists (select 1 from public.order_allocations d
                          where d.order_id = ord.id and d.product_id = item.product_id
                            and d.farmer_id = l.farmer_id and d.status = 'declined')
         and (on_truck is null
           or exists (select 1 from public.delivery_stops rs
                       where rs.driver_id = on_truck and rs.state = 'pending'
                         and private.haversine_km(f.latitude::numeric, f.longitude::numeric, rs.lat, rs.lng) <= detour)
           or exists (select 1 from public.driver_locations dl
                       where dl.driver_id = on_truck
                         and private.haversine_km(f.latitude::numeric, f.longitude::numeric, dl.lat, dl.lng) <= detour))
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

-- ── What to do about a gap on one product of an order ───────────────────────
create function private.settle_shortfall(p_order uuid, p_product uuid, p_missing numeric, p_expected numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tol numeric;
  need numeric;
  it record;
  ord public.orders;
begin
  if p_missing <= 0 then
    return;
  end if;
  select c.pickup_tolerance_pct into tol from public.ops_config c where c.id;
  if p_missing <= p_expected * tol / 100 then
    update public.order_items set tolerated_kg = tolerated_kg + p_missing where order_id = p_order and product_id = p_product;
    return;
  end if;

  -- Top up from other farms; a new pickup line joins the truck the order is already on.
  perform private.allocate_order(p_order);

  select oi.kg - oi.tolerated_kg - oi.short_kg - coalesce((
           select sum(a.kg) from public.order_allocations a
            where a.order_id = p_order and a.product_id = p_product and a.status in ('offered', 'accepted', 'collected')), 0) as gap,
         oi.unit, p.name
    into it
    from public.order_items oi join public.products p on p.id = oi.product_id
   where oi.order_id = p_order and oi.product_id = p_product;
  need := it.gap;
  if need is null or need <= 0 then
    return;
  end if;

  select * into ord from public.orders where id = p_order;
  update public.order_items set short_kg = short_kg + need where order_id = p_order and product_id = p_product;
  -- allocate_order raised the generic "no supply" item; this one says what it means for the buyer.
  perform private.auto_resolve_decision('no_supply', p_order::text || p_product::text || it.unit, 'Recorded as short supply.');
  perform private.raise_decision('short_supply', p_order,
    format('Order %s will be delivered %s %s short of %s: no farm near the route has it. The buyer is owed a refund for that quantity.',
           ord.code, (select oi.short_kg from public.order_items oi where oi.order_id = p_order and oi.product_id = p_product), it.unit, it.name),
    p_order::text || p_product::text);
  insert into public.notifications (user_id, title, body)
  values (ord.buyer_id, 'Part of your order is short',
    format('We could not source %s %s of %s for order %s. The rest is on its way, and you will be refunded for the missing quantity.',
           need, it.unit, it.name, ord.code));
end;
$$;
revoke all on function private.settle_shortfall(uuid, uuid, numeric, numeric) from public, anon, authenticated;

-- ── A pickup line is collected: spread what the driver recorded over its allocations, oldest listing first ──
create function private.collect_line(p_stop uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.delivery_stops;
  a record;
  remaining numeric;
  expected numeric := 0;
  got numeric;
begin
  select * into s from public.delivery_stops where id = p_stop;
  select coalesce(h.recorded_kg, 0) into remaining from public.delivery_handovers h where h.stop_id = p_stop;
  remaining := coalesce(remaining, 0);
  for a in
    select x.* from public.order_allocations x
      join public.produce_listings l on l.id = x.listing_id
     where x.pickup_stop_id = p_stop and x.status in ('offered', 'accepted')
     order by l.created_at, x.created_at
     for update of x
  loop
    expected := expected + a.kg;
    got := least(a.kg, remaining);
    remaining := remaining - got;
    if got <= 0 then
      update public.order_allocations set status = 'declined', responded_at = now() where id = a.id;
    else
      update public.order_allocations
         set kg = got, amount = round(got * a.farmer_price, 2), status = 'collected'
       where id = a.id;
      if got < a.kg then
        insert into public.order_allocations (order_id, product_id, listing_id, farmer_id, unit, kg, farmer_price, amount, km_to_buyer, status, responded_at)
        values (a.order_id, a.product_id, a.listing_id, a.farmer_id, a.unit, a.kg - got, a.farmer_price,
                round((a.kg - got) * a.farmer_price, 2), a.km_to_buyer, 'declined', now());
      end if;
    end if;
  end loop;
  -- The truck was there and the farm could not fill the line, so anything still unsold on those listings is not real.
  if remaining <= 0 and expected > coalesce((select h.recorded_kg from public.delivery_handovers h where h.stop_id = p_stop), 0) then
    update public.produce_listings l
       set weight_kg = (select sum(x.kg) from public.order_allocations x
                         where x.listing_id = l.id and x.status in ('offered', 'accepted', 'collected', 'declined', 'expired'))
     where l.id in (select x.listing_id from public.order_allocations x where x.pickup_stop_id = p_stop);
  end if;
  perform private.settle_shortfall(s.order_id, s.product_id,
    expected - coalesce((select h.recorded_kg from public.delivery_handovers h where h.stop_id = p_stop), 0), expected);
end;
$$;
revoke all on function private.collect_line(uuid) from public, anon, authenticated;

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
  perform private.plan_routes();
end;
$$;

create or replace function public.record_delivery_handover(
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
    -- Zero is a real answer: the farm had nothing. More than was reserved is not: the buyer paid for the reserved quantity.
    if kg is null or kg < 0 then
      raise exception 'enter the kilos';
    end if;
    if kg > (select coalesce(sum(a.kg), 0) from public.order_allocations a
              where a.pickup_stop_id = s.id and a.status in ('offered', 'accepted')) then
      raise exception 'more than reserved';
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

-- ── A farmer who cannot supply what is reserved says how much they really have ──
-- p_available is how much of the still-to-collect reservations on this listing the farmer can supply.
create function public.report_listing_shortage(p_listing uuid, p_available numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  l public.produce_listings;
  a record;
  reserved numeric;
  cut numeric;
  take numeric;
  hit record;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select * into l from public.produce_listings where id = p_listing and farmer_id = uid for update;
  if not found then
    raise exception 'listing not found';
  end if;
  select coalesce(sum(x.kg), 0) into reserved from public.order_allocations x
   where x.listing_id = p_listing and x.status in ('offered', 'accepted');
  if p_available is null or p_available < 0 or p_available >= reserved then
    raise exception 'enter less than the % reserved', reserved;
  end if;

  create temp table if not exists _hit (order_id uuid, product_id uuid, missing numeric, expected numeric) on commit drop;
  truncate _hit;
  cut := reserved - p_available;
  -- The newest reservations give way first.
  for a in
    select x.* from public.order_allocations x
     where x.listing_id = p_listing and x.status in ('offered', 'accepted')
     order by x.created_at desc for update
  loop
    exit when cut <= 0;
    take := least(a.kg, cut);
    cut := cut - take;
    insert into _hit values (a.order_id, a.product_id, take, a.kg);
    if take >= a.kg then
      update public.order_allocations set status = 'declined', responded_at = now() where id = a.id;
    else
      update public.order_allocations set kg = a.kg - take, amount = round((a.kg - take) * a.farmer_price, 2) where id = a.id;
      insert into public.order_allocations (order_id, product_id, listing_id, farmer_id, unit, kg, farmer_price, amount, km_to_buyer, status, responded_at)
      values (a.order_id, a.product_id, a.listing_id, a.farmer_id, a.unit, take, a.farmer_price, round(take * a.farmer_price, 2), a.km_to_buyer, 'declined', now());
    end if;
  end loop;

  -- Nothing unsold is left either: the listing is now exactly what is committed.
  update public.produce_listings
     set weight_kg = (select sum(x.kg) from public.order_allocations x
                       where x.listing_id = p_listing and x.status in ('offered', 'accepted', 'collected', 'declined', 'expired'))
   where id = p_listing;

  -- Pickup lines show the new quantity.
  update public.delivery_stops st
     set label = regexp_replace(st.label, '^Pick up [0-9.]+',
           'Pick up ' || (select coalesce(sum(x.kg), 0)::text from public.order_allocations x where x.pickup_stop_id = st.id and x.status in ('offered', 'accepted')))
   where st.state = 'pending' and st.kind = 'pickup'
     and st.id in (select x.pickup_stop_id from public.order_allocations x where x.listing_id = p_listing);

  for hit in select order_id, product_id, sum(missing) as missing, sum(expected) as expected from _hit group by order_id, product_id loop
    perform private.settle_shortfall(hit.order_id, hit.product_id, hit.missing, hit.expected);
  end loop;
  perform private.plan_routes();
end;
$$;
revoke all on function public.report_listing_shortage(uuid, numeric) from public, anon;
grant execute on function public.report_listing_shortage(uuid, numeric) to authenticated;
