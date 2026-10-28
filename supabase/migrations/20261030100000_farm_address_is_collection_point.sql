-- A farmer's collection point is their saved farm address; farmers no longer pick one.
-- Each farmer gets one private collection_points row, kept in step with their address and name.
-- Routes, captures and lots keep pointing at collection_points, so nothing downstream changes.
-- Listing also needs a saved address as well as a MoMo wallet (the app gates on both).

alter table public.collection_points
  add column farmer_id uuid unique references public.farmers (id) on delete cascade;

create or replace function private.sync_farmer_collection_point(p_farmer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.farmers%rowtype;
  who text;
begin
  select * into f from public.farmers where id = p_farmer;
  if not found or nullif(btrim(f.address), '') is null then
    return;
  end if;
  select nullif(btrim(display_name), '') into who from public.profiles where id = p_farmer;
  insert into public.collection_points (farmer_id, name, locality, address)
  values (
    p_farmer,
    left(coalesce(who, 'Farmer') || ' · farm', 80),
    f.locality,
    concat_ws(', ', nullif(btrim(f.line1), ''), btrim(f.address))
  )
  on conflict (farmer_id) do update
    set name = excluded.name, locality = excluded.locality, address = excluded.address, active = true;
end;
$$;
revoke all on function private.sync_farmer_collection_point(uuid) from public, anon, authenticated;

create or replace function private.farmers_sync_point()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_farmer_collection_point(new.id);
  return null;
end;
$$;
revoke all on function private.farmers_sync_point() from public, anon, authenticated;

create trigger farmers_sync_point
after insert or update of address, line1, locality on public.farmers
for each row execute function private.farmers_sync_point();

create or replace function private.profiles_sync_point()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_farmer_collection_point(new.id);
  return null;
end;
$$;
revoke all on function private.profiles_sync_point() from public, anon, authenticated;

create trigger profiles_sync_point
after update of display_name on public.profiles
for each row execute function private.profiles_sync_point();

-- Listings always use the farmer's own point; whatever the client sends is ignored.
create or replace function private.listing_use_farm_point()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select id into new.collection_point_id from public.collection_points where farmer_id = new.farmer_id;
  return new;
end;
$$;
revoke all on function private.listing_use_farm_point() from public, anon, authenticated;

create trigger produce_listings_farm_point
before insert on public.produce_listings
for each row execute function private.listing_use_farm_point();

-- Backfill: existing farmers with an address get their point. Their old listings keep the shared point they chose.
select private.sync_farmer_collection_point(id) from public.farmers where nullif(btrim(address), '') is not null;

-- Farm points are private to the farmer, ops and the assigned agent; only shared points stay visible to everyone.
drop policy if exists collection_points_select_active on public.collection_points;
create policy collection_points_select_active on public.collection_points
  for select to authenticated
  using (active and (farmer_id is null or farmer_id = (select auth.uid())));

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
