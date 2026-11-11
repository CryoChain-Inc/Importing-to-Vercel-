-- farmer-supply: what a farmer may change on a listing once orders rely on it, and a clearer stock breakdown.
--   reserved  = allocated to a paid order, not yet collected
--   collected = picked up by the driver
-- Reductions below what is reserved stay refused; "I cannot supply it" is a shortage report (shortfall module).

-- Columns are appended so existing readers of the view are unaffected.
create or replace view public.listing_stock with (security_invoker = true) as
select
  l.id as listing_id,
  l.farmer_id,
  l.weight_kg as listed_kg,
  coalesce(sum(a.kg) filter (where a.status in ('offered', 'accepted', 'collected')), 0) as sold_kg,
  coalesce(sum(a.kg) filter (where a.status = 'collected' and a.payout_status <> 'pending'), 0) as delivered_kg,
  coalesce(sum(a.kg) filter (where a.status in ('declined', 'expired')), 0) as withdrawn_kg,
  greatest(0, l.weight_kg - coalesce(sum(a.kg) filter (where a.status in ('offered', 'accepted', 'collected', 'declined', 'expired')), 0)) as remaining_kg,
  coalesce(sum(a.amount) filter (where a.status in ('offered', 'accepted', 'collected')), 0) as earned,
  coalesce(sum(a.amount) filter (where a.payout_status = 'paid'), 0) as paid_out,
  coalesce(sum(a.kg) filter (where a.status in ('offered', 'accepted')), 0) as reserved_kg,
  coalesce(sum(a.kg) filter (where a.status = 'collected'), 0) as collected_kg
from public.produce_listings l
left join public.order_allocations a on a.listing_id = l.id
group by l.id;

-- Shared by every farmer edit: refuses a listing that can no longer change, returns the quantity already committed.
create function private.guard_listing_edit(l public.produce_listings)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  committed numeric;
  collected numeric;
begin
  if l.lot_id is not null then
    raise exception 'already in a lot';
  end if;
  if exists (
    select 1 from public.order_allocations a
     where a.listing_id = l.id and private.order_is_delivered(a.order_id)
  ) then
    raise exception 'this produce has been delivered, so it can no longer be edited';
  end if;
  select coalesce(sum(a.kg) filter (where a.status in ('offered', 'accepted', 'collected', 'declined', 'expired')), 0),
         coalesce(sum(a.kg) filter (where a.status = 'collected'), 0)
    into committed, collected
    from public.order_allocations a
   where a.listing_id = l.id;
  if collected >= l.weight_kg then
    raise exception 'this produce has been collected, so it can no longer be edited';
  end if;
  return committed;
end;
$$;
revoke all on function private.guard_listing_edit(public.produce_listings) from public, anon, authenticated;

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
  committed := private.guard_listing_edit(l);
  if p_unit is null or char_length(btrim(p_unit)) not between 1 and 40 then
    raise exception 'invalid unit';
  end if;
  if p_weight_kg is null or p_weight_kg <= 0 or p_weight_kg >= 100000000 then
    raise exception 'invalid weight';
  end if;
  if not exists (select 1 from public.products p where p.name = btrim(p_product) and p.active) then
    raise exception 'unknown product';
  end if;
  if committed > 0 and (btrim(p_product) <> l.product or p_unit <> l.unit) then
    raise exception 'part of this listing is already sold, so the product and unit cannot change';
  end if;
  if p_weight_kg < committed then
    raise exception 'quantity cannot be below the % % already reserved', committed, l.unit;
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

-- Replaces a listing's photos. Once anything is reserved, photos can be added but the ones the order relied on stay.
-- Returns the paths that were dropped so the caller can delete the files.
create function public.update_own_listing_photos(p_id uuid, p_paths text[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  l public.produce_listings;
  committed numeric;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  select * into l from public.produce_listings where id = p_id and farmer_id = uid for update;
  if not found then
    raise exception 'listing not found';
  end if;
  committed := private.guard_listing_edit(l);
  if p_paths is null or cardinality(p_paths) not between 3 and 6
     or (select count(distinct x) from unnest(p_paths) x) <> cardinality(p_paths) then
    raise exception 'add 3 to 6 photos';
  end if;
  if exists (select 1 from unnest(p_paths) x where x is null or x not like uid::text || '/%') then
    raise exception 'invalid photo path';
  end if;
  if committed > 0 and not (l.image_paths <@ p_paths) then
    raise exception 'photos of reserved produce cannot be removed';
  end if;
  update public.produce_listings set image_paths = p_paths where id = p_id and farmer_id = uid;
  return array(select x from unnest(l.image_paths) x where x <> all (p_paths));
end;
$$;
revoke all on function public.update_own_listing_photos(uuid, text[]) from public, anon;
grant execute on function public.update_own_listing_photos(uuid, text[]) to authenticated;
