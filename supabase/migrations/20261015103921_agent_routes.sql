-- Field-agent routes. Ops assigns today's stops (a collection point plus one product) to an agent.
-- At a stop the agent records scale weight, grade and a photograph against each farmer listing.

create or replace function private.is_agent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'agent');
$$;

revoke all on function private.is_agent() from public, anon;
grant execute on function private.is_agent() to authenticated;

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.profiles (id),
  service_date date not null default (timezone('Africa/Accra', now()))::date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (agent_id, service_date)
);

create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.routes (id) on delete cascade,
  collection_point_id uuid not null references public.collection_points (id),
  product text not null,
  unique (route_id, collection_point_id, product),
  constraint route_stops_product_len check (char_length(btrim(product)) between 2 and 80)
);

create table public.captures (
  listing_id uuid primary key references public.produce_listings (id) on delete cascade,
  agent_id uuid not null references public.profiles (id),
  recorded_kg numeric(10, 2) not null check (recorded_kg > 0 and recorded_kg <= 100000),
  grade text not null check (grade in ('A', 'B', 'Reject')),
  photo_path text not null,
  updated_at timestamptz not null default now(),
  constraint captures_photo_path_len check (char_length(photo_path) between 3 and 300)
);

create index route_stops_route_idx on public.route_stops (route_id);
create index route_stops_point_idx on public.route_stops (collection_point_id, product);

create or replace function private.touch_capture()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger captures_touch
before update on public.captures
for each row execute function private.touch_capture();

-- One route per agent per day. Sending stops again replaces that day's stops; saved captures stay on the listings.
create or replace function public.assign_route(p_agent_id uuid, p_stops jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rid uuid;
  today date := (timezone('Africa/Accra', now()))::date;
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if not exists (select 1 from public.profiles where id = p_agent_id and role = 'agent') then
    raise exception 'choose an agent';
  end if;
  if jsonb_typeof(p_stops) is distinct from 'array' then
    raise exception 'choose at least one stop';
  end if;
  if jsonb_array_length(p_stops) = 0 then
    raise exception 'choose at least one stop';
  end if;

  insert into public.routes (agent_id, service_date, created_by)
  values (p_agent_id, today, uid)
  on conflict (agent_id, service_date) do update set created_by = excluded.created_by
  returning id into rid;

  delete from public.route_stops where route_id = rid;

  insert into public.route_stops (route_id, collection_point_id, product)
  select distinct rid, (value->>'collection_point_id')::uuid, btrim(value->>'product')
  from jsonb_array_elements(p_stops)
  where btrim(coalesce(value->>'product', '')) <> '';

  if not exists (select 1 from public.route_stops where route_id = rid) then
    raise exception 'choose at least one stop';
  end if;
  return rid;
end;
$$;

revoke all on function public.assign_route(uuid, jsonb) from public, anon;
grant execute on function public.assign_route(uuid, jsonb) to authenticated;

alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.captures enable row level security;

revoke all on table public.routes, public.route_stops, public.captures from anon, authenticated;
grant select on public.routes, public.route_stops to authenticated;
grant select, insert, update on public.captures to authenticated;
grant insert (listing_id, agent_id, recorded_kg, grade, photo_path) on public.captures to authenticated;
grant update (recorded_kg, grade, photo_path) on public.captures to authenticated;

create policy routes_select_own_or_ops on public.routes
  for select to authenticated
  using (agent_id = (select auth.uid()) or (select private.is_ops()));

create policy route_stops_select_own_or_ops on public.route_stops
  for select to authenticated
  using (
    (select private.is_ops())
    or exists (
      select 1 from public.routes r
      where r.id = route_id and r.agent_id = (select auth.uid())
    )
  );

-- An agent reads the listings, farmers and names for stops on their route.
create policy produce_listings_select_agent on public.produce_listings
  for select to authenticated
  using (
    exists (
      select 1
      from public.route_stops s
      join public.routes r on r.id = s.route_id
      where r.agent_id = (select auth.uid())
        and s.collection_point_id = produce_listings.collection_point_id
        and s.product = produce_listings.product
    )
  );

create policy farmers_select_agent on public.farmers
  for select to authenticated
  using (
    exists (
      select 1
      from public.produce_listings l
      join public.route_stops s
        on s.collection_point_id = l.collection_point_id
       and s.product = l.product
      join public.routes r on r.id = s.route_id
      where l.farmer_id = farmers.id
        and r.agent_id = (select auth.uid())
    )
  );

create policy profiles_select_agent on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.produce_listings l
      join public.route_stops s
        on s.collection_point_id = l.collection_point_id
       and s.product = l.product
      join public.routes r on r.id = s.route_id
      where l.farmer_id = profiles.id
        and r.agent_id = (select auth.uid())
    )
  );

create policy collection_points_select_agent on public.collection_points
  for select to authenticated
  using (
    exists (
      select 1
      from public.route_stops s
      join public.routes r on r.id = s.route_id
      where s.collection_point_id = collection_points.id
        and r.agent_id = (select auth.uid())
    )
  );

create policy captures_select_own_or_ops on public.captures
  for select to authenticated
  using (agent_id = (select auth.uid()) or (select private.is_ops()));

create policy captures_insert_own on public.captures
  for insert to authenticated
  with check (
    agent_id = (select auth.uid())
    and (select private.is_agent())
    and exists (
      select 1
      from public.produce_listings l
      join public.route_stops s
        on s.collection_point_id = l.collection_point_id
       and s.product = l.product
      join public.routes r on r.id = s.route_id
      where l.id = listing_id
        and r.agent_id = (select auth.uid())
        and r.service_date = (timezone('Africa/Accra', now()))::date
    )
  );

create policy captures_update_own on public.captures
  for update to authenticated
  using (agent_id = (select auth.uid()) and (select private.is_agent()))
  with check (agent_id = (select auth.uid()));

-- Photographs stay private. The path starts with the agent's user id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('captures', 'captures', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy captures_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'captures'
    and (select private.is_agent())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy captures_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy captures_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'captures'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_ops())
    )
  );
