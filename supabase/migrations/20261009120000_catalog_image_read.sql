-- Catalog photos live in the private captures bucket. Buyers may read only
-- the category and product files, not farm-gate captures.
create policy "catalog images readable"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'captures'
    and (
      storage.filename(name) like 'category-%'
      or storage.filename(name) like 'product-%'
    )
  );
