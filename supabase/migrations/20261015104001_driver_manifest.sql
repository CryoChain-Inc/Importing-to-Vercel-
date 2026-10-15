-- Driver manifest on the same daily route ops assigns to an agent.
-- The driver can leave a stop only after the temperature is logged and the agent has captured every
-- farmer and confirmed the lot. Delivery needs a photograph and the receiver's name.

create or replace function private.is_driver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'driver');
$$;

revoke all on function private.is_driver() from public, anon;
grant execute on function private.is_driver() to authenticated;

alter table public.routes
  add column driver_id uuid references public.profiles (id),
  add column destination text,
  add column delivery_photo_path text,
  add column received_by text,
  add column delivered_at timestamptz,
  add constraint routes_destination_len check (destination is null or char_length(btrim(destination)) between 2 and 80),
  add constraint routes_receiver_len check (received_by is null or char_length(btrim(received_by)) between 2 and 80);

create unique index routes_one_driver_per_day on public.routes (driver_id, service_date) where driver_id is not null;

alter table public.route_stops
  add column confirmed_at timestamptz,
  add column arrived_at timestamptz,
  add column temperature_c numeric(4, 1),
  add column departed_at timestamptz;

-- Assigning again replaces today's stops and can attach the driver who will collect them.
drop function if exists public.assign_route(uuid, jsonb);

create or replace function public.assign_route(
  p_agent_id uuid,
  p_stops jsonb,
  p_driver_id uuid default null,
  p_destination text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  rid uuid;
  today date := (timezone('Africa/Accra', now()))::date;
  dest text := nullif(btrim(coalesce(p_destination, '')), '');
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if not exists (select 1 from public.profiles where id = p_agent_id and role = 'agent') then
    raise exception 'choose an agent';
  end if;
  if p_driver_id is not null and not exists (select 1 from public.profiles where id = p_driver_id and role = 'driver') then
    raise exception 'choose a driver';
  end if;
  if p_driver_id is not null and (dest is null or char_length(dest) < 2) then
    raise exception 'enter a destination';
  end if;
  if p_driver_id is not null and exists (
    select 1 from public.routes
    where driver_id = p_driver_id and service_date = today and agent_id <> p_agent_id
  ) then
    raise exception 'driver already assigned';
  end if;
  if jsonb_typeof(p_stops) is distinct from 'array' then
    raise exception 'choose at least one stop';
  end if;
  if jsonb_array_length(p_stops) = 0 then
    raise exception 'choose at least one stop';
  end if;

  insert into public.routes (agent_id, service_date, created_by, driver_id, destination)
  values (p_agent_id, today, uid, p_driver_id, dest)
  on conflict (agent_id, service_date) do update
    set created_by = excluded.created_by,
        driver_id = excluded.driver_id,
        destination = excluded.destination
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

revoke all on function public.assign_route(uuid, jsonb, uuid, text) from public, anon;
grant execute on function public.assign_route(uuid, jsonb, uuid, text) to authenticated;

-- Agent confirms a stop once every listing there has a capture. That is the driver's permission to load.
create or replace function public.confirm_stop(p_stop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (timezone('Africa/Accra', now()))::date;
  point uuid;
  prod text;
  listed int;
  captured int;
begin
  if not (select private.is_agent()) then
    raise exception 'agent only';
  end if;

  select s.collection_point_id, s.product into point, prod
  from public.route_stops s
  join public.routes r on r.id = s.route_id
  where s.id = p_stop_id and r.agent_id = uid and r.service_date = today;
  if point is null then
    raise exception 'stop not on your route';
  end if;

  select count(*) into listed
  from public.produce_listings
  where collection_point_id = point and product = prod;

  select count(*) into captured
  from public.produce_listings l
  join public.captures c on c.listing_id = l.id
  where l.collection_point_id = point and l.product = prod;

  if listed = 0 or captured <> listed then
    raise exception 'capture every farmer first';
  end if;

  update public.route_stops set confirmed_at = now() where id = p_stop_id;
end;
$$;

revoke all on function public.confirm_stop(uuid) from public, anon;
grant execute on function public.confirm_stop(uuid) to authenticated;

create or replace function public.arrive_stop(p_stop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (timezone('Africa/Accra', now()))::date;
begin
  if not (select private.is_driver()) then
    raise exception 'driver only';
  end if;
  update public.route_stops s
    set arrived_at = coalesce(s.arrived_at, now())
  from public.routes r
  where s.id = p_stop_id
    and s.route_id = r.id
    and r.driver_id = uid
    and r.service_date = today
    and r.delivered_at is null;
  if not found then
    raise exception 'stop not on your route';
  end if;
end;
$$;

create or replace function public.log_stop_temperature(p_stop_id uuid, p_celsius numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (timezone('Africa/Accra', now()))::date;
  arrived timestamptz;
  lo numeric;
  hi numeric;
begin
  if not (select private.is_driver()) then
    raise exception 'driver only';
  end if;
  if p_celsius is null or p_celsius < -20 or p_celsius > 40 then
    raise exception 'temperature out of range';
  end if;

  select min_temp_c, max_temp_c into lo, hi from public.ops_config where id;
  if lo is not null and p_celsius < lo then
    raise exception 'temperature out of range';
  end if;
  if hi is not null and p_celsius > hi then
    raise exception 'temperature out of range';
  end if;

  select s.arrived_at into arrived
  from public.route_stops s
  join public.routes r on r.id = s.route_id
  where s.id = p_stop_id and r.driver_id = uid and r.service_date = today and r.delivered_at is null;
  if arrived is null then
    raise exception 'arrive first';
  end if;

  update public.route_stops set temperature_c = p_celsius where id = p_stop_id;
end;
$$;

create or replace function public.depart_stop(p_stop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (timezone('Africa/Accra', now()))::date;
  point uuid;
  prod text;
  arrived timestamptz;
  temp numeric;
  confirmed timestamptz;
  listed int;
  captured int;
begin
  if not (select private.is_driver()) then
    raise exception 'driver only';
  end if;

  select s.collection_point_id, s.product, s.arrived_at, s.temperature_c, s.confirmed_at
    into point, prod, arrived, temp, confirmed
  from public.route_stops s
  join public.routes r on r.id = s.route_id
  where s.id = p_stop_id and r.driver_id = uid and r.service_date = today and r.delivered_at is null;
  if point is null then
    raise exception 'stop not on your route';
  end if;
  if arrived is null then
    raise exception 'arrive first';
  end if;
  if temp is null then
    raise exception 'log the temperature';
  end if;

  select count(*) into listed from public.produce_listings where collection_point_id = point and product = prod;
  select count(*) into captured
  from public.produce_listings l
  join public.captures c on c.listing_id = l.id
  where l.collection_point_id = point and l.product = prod;

  if confirmed is null or listed = 0 or captured <> listed then
    raise exception 'lot not ready';
  end if;

  update public.route_stops set departed_at = coalesce(departed_at, now()) where id = p_stop_id;
end;
$$;

create or replace function public.complete_delivery(p_route_id uuid, p_receiver text, p_photo_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (timezone('Africa/Accra', now()))::date;
  name text := btrim(coalesce(p_receiver, ''));
begin
  if not (select private.is_driver()) then
    raise exception 'driver only';
  end if;
  if char_length(name) < 2 then
    raise exception 'enter the receiver name';
  end if;
  if p_photo_path is null or p_photo_path not like (uid::text || '/%') then
    raise exception 'take a photograph';
  end if;
  if exists (
    select 1 from public.route_stops where route_id = p_route_id and departed_at is null
  ) then
    raise exception 'finish every stop first';
  end if;

  update public.routes
    set received_by = name, delivery_photo_path = p_photo_path, delivered_at = now()
  where id = p_route_id and driver_id = uid and service_date = today and delivered_at is null;
  if not found then
    raise exception 'stop not on your route';
  end if;
end;
$$;

revoke all on function public.arrive_stop(uuid), public.log_stop_temperature(uuid, numeric),
  public.depart_stop(uuid), public.complete_delivery(uuid, text, text) from public, anon;
grant execute on function public.arrive_stop(uuid), public.log_stop_temperature(uuid, numeric),
  public.depart_stop(uuid), public.complete_delivery(uuid, text, text) to authenticated;

-- One payload for the driver dashboard. Counts stay on the server so listings are not opened to drivers.
create or replace function public.driver_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  today date := (timezone('Africa/Accra', now()))::date;
  result jsonb;
begin
  if not (select private.is_driver()) then
    raise exception 'driver only';
  end if;

  select jsonb_build_object(
    'id', r.id,
    'destination', r.destination,
    'plate', d.plate_number,
    'deliveredAt', r.delivered_at,
    'receivedBy', r.received_by,
    'stops', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'pointName', cp.name,
          'locality', coalesce(cp.locality, ''),
          'product', s.product,
          'farmers', (
            select count(*) from public.produce_listings l
            where l.collection_point_id = s.collection_point_id and l.product = s.product
          ),
          'listedKg', (
            select coalesce(sum(l.weight_kg), 0) from public.produce_listings l
            where l.collection_point_id = s.collection_point_id and l.product = s.product
          ),
          'captured', (
            select count(*) from public.produce_listings l
            join public.captures c on c.listing_id = l.id
            where l.collection_point_id = s.collection_point_id and l.product = s.product
          ),
          'confirmed', s.confirmed_at is not null,
          'arrivedAt', s.arrived_at,
          'temperatureC', s.temperature_c,
          'departedAt', s.departed_at
        )
        order by cp.name, s.product
      )
      from public.route_stops s
      join public.collection_points cp on cp.id = s.collection_point_id
      where s.route_id = r.id
    ), '[]'::jsonb)
  )
  into result
  from public.routes r
  left join public.drivers d on d.id = r.driver_id
  where r.driver_id = uid and r.service_date = today;

  return result;
end;
$$;

revoke all on function public.driver_today() from public, anon;
grant execute on function public.driver_today() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('deliveries', 'deliveries', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy deliveries_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'deliveries'
    and (select private.is_driver())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy deliveries_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'deliveries'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy deliveries_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deliveries'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_ops())
    )
  );
