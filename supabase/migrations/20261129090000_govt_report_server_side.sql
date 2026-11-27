-- Farmer report, computed in the database: search, filters, sorting, paging, totals, collection-point rollups and map
-- points all run server-side, so the browser only ever holds one page of farmers plus the map points.
-- Same guard as before (ops, or the single govt account); the private helpers are never callable from the API.

drop function if exists public.farmer_report();

-- Listing rows for every farmer that passes the filters. Product/unit narrow the lines (and drop farmers with none left);
-- status is judged on the lines that remain, like the old client-side filter was.
create or replace function private.report_lines(
  p_q text, p_locality text, p_product text, p_unit text, p_status text, p_wallet text
)
returns table (
  farmer_id uuid, farmer_name text, phone text, locality text, address text,
  latitude double precision, longitude double precision, wallet_verified boolean, joined_at timestamptz,
  listing_id uuid, product text, unit text, listed numeric, sold numeric, delivered numeric, remaining numeric,
  listed_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with raw as (
    select f.id as farmer_id, coalesce(p.display_name, 'Unnamed farmer') as farmer_name,
           coalesce(p.phone, '') as phone, coalesce(f.locality, '') as locality, coalesce(f.address, '') as address,
           f.latitude, f.longitude, (f.wallet_verified_at is not null) as wallet_verified, f.created_at as joined_at,
           l.id as listing_id, l.product, l.unit, coalesce(l.weight_kg, 0) as listed,
           coalesce(s.sold_kg, 0) as sold, coalesce(s.delivered_kg, 0) as delivered,
           coalesce(s.remaining_kg, 0) as remaining, l.created_at as listed_at
      from public.farmers f
      join public.profiles p on p.id = f.id
      left join public.produce_listings l on l.farmer_id = f.id
        and (coalesce(p_product, '') = '' or l.product = p_product)
        and (coalesce(p_unit, '') = '' or l.unit = p_unit)
      left join public.listing_stock s on s.listing_id = l.id
     where (coalesce(p_locality, '') = '' or f.locality = p_locality)
       and (coalesce(p_wallet, 'all') = 'all' or (f.wallet_verified_at is not null) = (p_wallet = 'verified'))
       and (coalesce(btrim(p_q), '') = ''
            or concat_ws(' ', p.display_name, p.phone, f.locality, f.address)
               ilike '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  ), marked as (
    select raw.*, count(raw.listing_id) over (partition by raw.farmer_id) as n,
           coalesce(bool_or(raw.remaining > 0) over (partition by raw.farmer_id), false) as stocked
      from raw
  )
  select m.farmer_id, m.farmer_name, m.phone, m.locality, m.address, m.latitude, m.longitude, m.wallet_verified,
         m.joined_at, m.listing_id, m.product, m.unit, m.listed, m.sold, m.delivered, m.remaining, m.listed_at
    from marked m
   where (coalesce(p_status, 'all') = 'all'
          or (p_status = 'none' and m.n = 0)
          or (p_status = 'in_stock' and m.stocked)
          or (p_status = 'sold_out' and m.n > 0 and not m.stocked))
     and (m.n > 0 or (coalesce(p_product, '') = '' and coalesce(p_unit, '') = ''));
$$;

-- One row per matching farmer, ranked by the requested sort. Amount sorts only mean something inside one unit.
create or replace function private.report_farmers(
  p_q text, p_locality text, p_product text, p_unit text, p_status text, p_wallet text, p_sort text, p_dir text
)
returns table (
  rank bigint, farmer_id uuid, name text, phone text, locality text, address text,
  lat double precision, lng double precision, wallet_verified boolean, joined_at timestamptz,
  n_lines bigint, listed numeric, remaining numeric
)
language sql
stable
set search_path = ''
as $$
  with fm as (
    select l.farmer_id, min(l.farmer_name) as name, min(l.phone) as phone, min(l.locality) as locality,
           min(l.address) as address, min(l.latitude) as lat, min(l.longitude) as lng,
           bool_or(l.wallet_verified) as wallet_verified, min(l.joined_at) as joined_at,
           count(l.listing_id) as n_lines, sum(l.listed) as listed, sum(l.remaining) as remaining
      from private.report_lines(p_q, p_locality, p_product, p_unit, p_status, p_wallet) l
     group by l.farmer_id
  ), mode as (
    select case when coalesce(p_sort, '') in ('listed', 'remaining') and coalesce(p_unit, '') = '' then 'joined'
                when coalesce(p_sort, '') in ('name', 'locality', 'joined', 'listings', 'listed', 'remaining') then p_sort
                else 'joined' end as sort,
           coalesce(p_dir, 'desc') = 'asc' as is_asc
  ), keyed as (
    select fm.*, mode.is_asc,
           case mode.sort when 'name' then lower(fm.name) when 'locality' then lower(fm.locality) end as k_txt,
           case mode.sort when 'listings' then fm.n_lines::numeric when 'listed' then fm.listed
                          when 'remaining' then fm.remaining end as k_num,
           case when mode.sort = 'joined' then fm.joined_at end as k_ts
      from fm cross join mode
  )
  select row_number() over (
           order by case when k.is_asc then k.k_txt end asc, case when not k.is_asc then k.k_txt end desc,
                    case when k.is_asc then k.k_num end asc, case when not k.is_asc then k.k_num end desc,
                    case when k.is_asc then k.k_ts end asc, case when not k.is_asc then k.k_ts end desc,
                    k.name, k.farmer_id
         ) as rank,
         k.farmer_id, k.name, k.phone, k.locality, k.address, k.lat, k.lng, k.wallet_verified, k.joined_at,
         k.n_lines, k.listed, k.remaining
    from keyed k;
$$;

revoke all on function private.report_lines(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.report_farmers(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- Everything the screen needs for one set of filters: KPI totals, collection-point rollups, map points, filter options
-- and one page of farmers with their listings. p_metric picks what shades the map (only inside one unit).
create or replace function public.farmer_report_view(
  p_q text default null, p_locality text default null, p_product text default null, p_unit text default null,
  p_status text default 'all', p_wallet text default 'all', p_sort text default 'joined', p_dir text default 'desc',
  p_metric text default 'farmers', p_limit int default 12, p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_view_farmer_report()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  p_limit := least(greatest(coalesce(p_limit, 12), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  return (
    with ln as (
      select * from private.report_lines(p_q, p_locality, p_product, p_unit, p_status, p_wallet)
    ), fm as (
      select *, coalesce(nullif(locality, ''), 'No collection point') as area
        from private.report_farmers(p_q, p_locality, p_product, p_unit, p_status, p_wallet, p_sort, p_dir)
    ), ft as (
      select farmer_id, unit, sum(listed) as listed, sum(sold) as sold, sum(delivered) as delivered,
             sum(remaining) as remaining
        from ln where listing_id is not null group by farmer_id, unit
    ), pg as (
      select * from fm order by rank limit p_limit offset p_offset
    )
    select jsonb_build_object(
      'total', (select count(*) from fm),
      'located', (select count(*) from fm where lat is not null and lng is not null),
      'listings', (select coalesce(sum(n_lines), 0) from fm),
      'totals', (
        select coalesce(jsonb_agg(jsonb_build_object('unit', t.unit, 'listed', t.listed, 'sold', t.sold,
                 'delivered', t.delivered, 'remaining', t.remaining) order by t.unit), '[]'::jsonb)
          from (select unit, sum(listed) as listed, sum(sold) as sold, sum(delivered) as delivered,
                       sum(remaining) as remaining from ft group by unit) t
      ),
      'areas', (
        select coalesce(jsonb_agg(jsonb_build_object('locality', a.area, 'farmers', a.farmers,
                 'listings', a.listings, 'totals', a.totals) order by a.farmers desc, a.area), '[]'::jsonb)
          from (
            select g.area, g.farmers, g.listings,
                   (select coalesce(jsonb_agg(jsonb_build_object('unit', t.unit, 'listed', t.listed,
                             'remaining', t.remaining) order by t.unit), '[]'::jsonb)
                      from (select ft.unit, sum(ft.listed) as listed, sum(ft.remaining) as remaining
                              from ft join fm f2 on f2.farmer_id = ft.farmer_id
                             where f2.area = g.area group by ft.unit) t) as totals
              from (select area, count(*) as farmers, sum(n_lines) as listings from fm group by area) g
             order by g.farmers desc, g.area limit 40
          ) a
      ),
      'points', (
        select coalesce(jsonb_agg(jsonb_build_object('id', y.farmer_id, 'name', y.name, 'locality', y.locality,
                 'phone', y.phone, 'address', y.address, 'lat', y.lat, 'lng', y.lng, 'weight', y.w, 'listings', y.n_lines,
                 'walletVerified', y.wallet_verified,
                 'totals', (select coalesce(jsonb_agg(jsonb_build_object('unit', ft.unit, 'listed', ft.listed,
                              'remaining', ft.remaining) order by ft.unit), '[]'::jsonb)
                              from ft where ft.farmer_id = y.farmer_id))), '[]'::jsonb)
          from (
            select fm.*, case when coalesce(p_unit, '') = '' or p_metric = 'farmers' then 1::numeric
                              when p_metric = 'listed' then fm.listed else fm.remaining end as w
              from fm where lat is not null and lng is not null
          ) y
         where y.w > 0
      ),
      'options', jsonb_build_object(
        'localities', (select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
                         from (select distinct locality as v from public.farmers where coalesce(locality, '') <> '') t),
        'products', (select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
                       from (select distinct product as v from public.produce_listings where coalesce(product, '') <> '') t),
        'units', (select coalesce(jsonb_agg(v order by v), '[]'::jsonb)
                    from (select distinct unit as v from public.produce_listings where coalesce(unit, '') <> '') t)
      ),
      'farmers', (
        select coalesce(jsonb_agg(jsonb_build_object('id', pg.farmer_id, 'name', pg.name, 'phone', pg.phone,
                 'locality', pg.locality, 'address', pg.address, 'lat', pg.lat, 'lng', pg.lng,
                 'walletVerified', pg.wallet_verified, 'joinedAt', pg.joined_at,
                 'lines', (select coalesce(jsonb_agg(jsonb_build_object('id', l.listing_id, 'product', l.product,
                             'unit', l.unit, 'listed', l.listed, 'sold', l.sold, 'delivered', l.delivered,
                             'remaining', l.remaining, 'listedAt', l.listed_at) order by l.listed_at desc), '[]'::jsonb)
                             from ln l where l.farmer_id = pg.farmer_id and l.listing_id is not null),
                 'totals', (select coalesce(jsonb_agg(jsonb_build_object('unit', ft.unit, 'listed', ft.listed,
                              'sold', ft.sold, 'delivered', ft.delivered, 'remaining', ft.remaining)
                              order by ft.unit), '[]'::jsonb) from ft where ft.farmer_id = pg.farmer_id))
                 order by pg.rank), '[]'::jsonb)
          from pg
      )
    )
  );
end;
$$;

-- Flat rows for PDF, Excel and CSV: every farmer that matches, in the same order as the screen.
create or replace function public.farmer_report(
  p_q text default null, p_locality text default null, p_product text default null, p_unit text default null,
  p_status text default 'all', p_wallet text default 'all', p_sort text default 'joined', p_dir text default 'desc'
)
returns table (
  farmer_id uuid, farmer_name text, phone text, locality text, address text,
  latitude double precision, longitude double precision, wallet_verified boolean, joined_at timestamptz,
  listing_id uuid, product text, unit text, listed numeric, sold numeric, delivered numeric, remaining numeric,
  listed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.can_view_farmer_report()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select l.farmer_id, l.farmer_name, l.phone, l.locality, l.address, l.latitude, l.longitude, l.wallet_verified,
         l.joined_at, l.listing_id, l.product, l.unit, l.listed, l.sold, l.delivered, l.remaining, l.listed_at
    from private.report_farmers(p_q, p_locality, p_product, p_unit, p_status, p_wallet, p_sort, p_dir) f
    join private.report_lines(p_q, p_locality, p_product, p_unit, p_status, p_wallet) l on l.farmer_id = f.farmer_id
   order by f.rank, l.listed_at desc nulls last
   limit 20000;
end;
$$;

revoke all on function public.farmer_report_view(text, text, text, text, text, text, text, text, text, int, int)
  from public, anon;
grant execute on function public.farmer_report_view(text, text, text, text, text, text, text, text, text, int, int)
  to authenticated;
revoke all on function public.farmer_report(text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.farmer_report(text, text, text, text, text, text, text, text) to authenticated;
