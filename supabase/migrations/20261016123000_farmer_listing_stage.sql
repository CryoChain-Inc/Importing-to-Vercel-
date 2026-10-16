-- Farmer home splits listings into available and collected, and shows whether ops
-- has put each one in a lot. Collected means an agent has captured the listing,
-- the driver has loaded that stop, or the route has been delivered.
-- Farmers cannot read captures, routes, or lots directly.
-- Drop first so a re-run can add in_lot and lot_code to the result.

drop function if exists public.farmer_listings();

create function public.farmer_listings()
returns table (
  id uuid,
  product text,
  weight_kg numeric,
  created_at timestamptz,
  grade text,
  image_paths text[],
  est_net numeric,
  est_fee numeric,
  point text,
  recorded_kg numeric,
  stage text,
  in_lot boolean,
  lot_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id,
    l.product,
    l.weight_kg,
    l.created_at,
    l.grade,
    l.image_paths,
    l.est_net,
    l.est_fee,
    cp.name,
    c.recorded_kg,
    case
      when c.listing_id is null then 'available'
      when exists (
        select 1
        from public.route_stops s
        join public.routes r on r.id = s.route_id
        where s.collection_point_id = l.collection_point_id
          and s.product = l.product
          and r.delivered_at is not null
          and r.service_date >= (l.created_at at time zone 'Africa/Accra')::date
          and r.service_date <= (c.updated_at at time zone 'Africa/Accra')::date
      ) then 'delivered'
      when exists (
        select 1
        from public.route_stops s
        join public.routes r on r.id = s.route_id
        where s.collection_point_id = l.collection_point_id
          and s.product = l.product
          and s.departed_at is not null
          and r.service_date >= (l.created_at at time zone 'Africa/Accra')::date
          and r.service_date <= (c.updated_at at time zone 'Africa/Accra')::date
      ) then 'loaded'
      else 'captured'
    end,
    l.lot_id is not null,
    lot.code
  from public.produce_listings l
  left join public.collection_points cp on cp.id = l.collection_point_id
  left join public.captures c on c.listing_id = l.id
  left join public.lots lot on lot.id = l.lot_id
  where l.farmer_id = (select auth.uid())
  order by l.created_at desc;
$$;

revoke all on function public.farmer_listings() from public, anon;
grant execute on function public.farmer_listings() to authenticated;
