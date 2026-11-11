-- farmer-pickups: a farmer's own pickup schedule and history.
-- Each pickup line (one product from this farm for one order) shows what was expected, what the driver collected,
-- what it earns and whether it is paid. The buyer is never shown. Delivery stops are not readable by farmers,
-- so the arrival time comes through farmer_pickups().

-- The part of a line that could not be supplied now stays linked to that pickup, so expected = collected + short.
create or replace function private.collect_line(p_stop uuid)
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
        insert into public.order_allocations (order_id, product_id, listing_id, farmer_id, unit, kg, farmer_price, amount, km_to_buyer, status, responded_at, pickup_stop_id)
        values (a.order_id, a.product_id, a.listing_id, a.farmer_id, a.unit, a.kg - got, a.farmer_price,
                round((a.kg - got) * a.farmer_price, 2), a.km_to_buyer, 'declined', now(), a.pickup_stop_id);
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

create or replace function public.report_listing_shortage(p_listing uuid, p_available numeric)
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
      insert into public.order_allocations (order_id, product_id, listing_id, farmer_id, unit, kg, farmer_price, amount, km_to_buyer, status, responded_at, pickup_stop_id)
      values (a.order_id, a.product_id, a.listing_id, a.farmer_id, a.unit, take, a.farmer_price, round(take * a.farmer_price, 2), a.km_to_buyer, 'declined', now(), a.pickup_stop_id);
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

update public.order_allocations d
   set pickup_stop_id = c.pickup_stop_id
  from public.order_allocations c
 where d.status = 'declined' and d.pickup_stop_id is null and c.pickup_stop_id is not null
   and c.order_id = d.order_id and c.listing_id = d.listing_id and c.farmer_id = d.farmer_id;

create function public.farmer_pickups()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x.obj order by x.upcoming desc, x.sort_at desc), '[]'::jsonb)
  from (
    select
      bool_or(a.status in ('offered', 'accepted')) as upcoming,
      coalesce(max(s.done_at), max(s.eta), max(a.created_at)) as sort_at,
      jsonb_build_object(
        'id', coalesce(a.pickup_stop_id, min(a.id::text)::uuid),
        'product', p.name,
        'unit', min(a.unit),
        'expected', sum(a.kg) filter (where a.status in ('offered', 'accepted', 'collected', 'declined')),
        'collected', coalesce(sum(a.kg) filter (where a.status = 'collected'), 0),
        'short', coalesce(sum(a.kg) filter (where a.status = 'declined'), 0),
        'earning', coalesce(sum(a.amount) filter (where a.status in ('offered', 'accepted', 'collected')), 0),
        'paid', coalesce(sum(a.amount) filter (where a.payout_status = 'paid'), 0),
        'state', case
          when bool_or(a.status in ('offered', 'accepted')) and max(s.driver_id::text) is not null then 'on_the_way'
          when bool_or(a.status in ('offered', 'accepted')) then 'waiting'
          when bool_and(a.payout_status = 'paid' or a.status = 'declined') and bool_or(a.status = 'collected') then 'paid'
          when bool_or(a.payout_status = 'payable') then 'delivered'
          when bool_or(a.status = 'collected') then 'collected'
          else 'not_supplied' end,
        'eta', coalesce(max(s.eta) filter (where s.state = 'pending'), max(a.pickup_at)),
        'collectedAt', max(s.done_at),
        'reservedAt', min(a.created_at)
      ) as obj
    from public.order_allocations a
    join public.products p on p.id = a.product_id
    left join public.delivery_stops s on s.id = a.pickup_stop_id
    where a.farmer_id = (select auth.uid())
      and a.status in ('offered', 'accepted', 'collected', 'declined')
    group by coalesce(a.pickup_stop_id, a.id), a.pickup_stop_id, p.name
  ) x;
$$;
revoke all on function public.farmer_pickups() from public, anon;
grant execute on function public.farmer_pickups() to authenticated;
