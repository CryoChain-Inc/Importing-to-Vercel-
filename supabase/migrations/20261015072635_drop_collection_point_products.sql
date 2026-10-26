-- Collection points no longer carry an accepted-products list or a collection window
-- (windows are set per route). Listings may use any active product at an active point.
drop policy if exists produce_listings_insert_own on public.produce_listings;
create policy produce_listings_insert_own on public.produce_listings
  for insert to authenticated
  with check (
    farmer_id = (select auth.uid())
    and exists (select 1 from public.farmers f where f.id = (select auth.uid()) and f.momo_number is not null)
    and exists (select 1 from public.collection_points cp where cp.id = produce_listings.collection_point_id and cp.active)
    and exists (select 1 from public.products p where p.name = produce_listings.product and p.active)
  );

drop table public.collection_point_products;

alter table public.collection_points
  drop constraint collection_points_window,
  drop constraint collection_points_days,
  drop column days,
  drop column window_start,
  drop column window_end;
