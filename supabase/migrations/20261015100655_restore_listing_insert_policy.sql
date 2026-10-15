-- The remote database had no INSERT policy on produce_listings (an earlier version of
-- 20261015072635 was applied before it was edited, and its table drop took the policy with it).
-- With RLS on and no INSERT policy, every listing was denied. Recreate it.
drop policy if exists produce_listings_insert_own on public.produce_listings;
create policy produce_listings_insert_own on public.produce_listings
  for insert to authenticated
  with check (
    farmer_id = (select auth.uid())
    and exists (select 1 from public.farmers f where f.id = (select auth.uid()) and f.momo_number is not null)
    and exists (select 1 from public.collection_points cp where cp.id = produce_listings.collection_point_id and cp.active)
    and exists (select 1 from public.products p where p.name = produce_listings.product and p.active)
  );
