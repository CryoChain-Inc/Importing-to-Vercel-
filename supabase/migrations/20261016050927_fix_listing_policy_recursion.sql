-- Listing inserts failed with 42P17 (infinite recursion in policy for produce_listings):
-- produce_listings_insert_own reads farmers, and farmers_select_agent reads produce_listings again.
-- The agent lookup moves into a security-definer helper so those policies no longer query produce_listings under RLS.

create or replace function private.agent_serves_farmer(p_farmer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.produce_listings l
    join public.route_stops s on s.collection_point_id = l.collection_point_id and s.product = l.product
    join public.routes r on r.id = s.route_id
    where l.farmer_id = p_farmer
      and r.agent_id = (select auth.uid())
  );
$$;

revoke all on function private.agent_serves_farmer(uuid) from public, anon;
grant execute on function private.agent_serves_farmer(uuid) to authenticated;

drop policy if exists farmers_select_agent on public.farmers;
create policy farmers_select_agent on public.farmers
  for select to authenticated
  using ((select private.agent_serves_farmer(farmers.id)));

drop policy if exists profiles_select_agent on public.profiles;
create policy profiles_select_agent on public.profiles
  for select to authenticated
  using ((select private.agent_serves_farmer(profiles.id)));
