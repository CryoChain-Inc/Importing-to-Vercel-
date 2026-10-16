-- A farmer can withdraw a listing until ops adds it to a lot.
-- A capture does not block removal. Direct deletes fail once an agent has captured
-- the listing, because that cascades into captures and the farmer cannot delete
-- those rows. This function runs as the owner, so the capture goes with the listing.
-- Once lot_id is set, the lot is what buyers see, and the listing stays.

create or replace function public.delete_own_listing(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  paths text[];
  allocated uuid;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select l.image_paths, l.lot_id into paths, allocated
    from public.produce_listings l
   where l.id = p_id and l.farmer_id = uid;
  if not found then
    raise exception 'listing not found';
  end if;
  if allocated is not null then
    raise exception 'already in a lot';
  end if;

  delete from public.captures where listing_id = p_id;
  delete from public.produce_listings where id = p_id and farmer_id = uid;
  return coalesce(paths, '{}');
end;
$$;

revoke all on function public.delete_own_listing(uuid) from public, anon;
grant execute on function public.delete_own_listing(uuid) to authenticated;

-- Keep a direct delete working for listings that have no capture yet.
drop policy if exists produce_listings_delete_own on public.produce_listings;
create policy produce_listings_delete_own on public.produce_listings
  for delete to authenticated
  using (farmer_id = (select auth.uid()) and lot_id is null);

grant delete on public.captures to authenticated;
drop policy if exists captures_delete_with_listing on public.captures;
create policy captures_delete_with_listing on public.captures
  for delete to authenticated
  using (
    exists (
      select 1
      from public.produce_listings l
      where l.id = captures.listing_id
        and l.farmer_id = (select auth.uid())
        and l.lot_id is null
    )
  );
