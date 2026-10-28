-- Listing needs a saved farm address as well as a MoMo wallet, so the truck knows where to collect.
-- Same policy as 20261015100655 plus the address check.
drop policy if exists produce_listings_insert_own on public.produce_listings;
create policy produce_listings_insert_own on public.produce_listings
  for insert to authenticated
  with check (
    farmer_id = (select auth.uid())
    and exists (
      select 1 from public.farmers f
      where f.id = (select auth.uid()) and f.momo_number is not null and nullif(btrim(f.address), '') is not null
    )
    and exists (select 1 from public.collection_points cp where cp.id = produce_listings.collection_point_id and cp.active)
    and exists (select 1 from public.products p where p.name = produce_listings.product and p.active)
  );
