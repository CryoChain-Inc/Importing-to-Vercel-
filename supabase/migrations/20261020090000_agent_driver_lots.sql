-- Agent/driver rework:
--  * a confirmed stop locks the agent's captures
--  * the driver can read what the agent captured at a stop, and see their delivery photos
--  * a lot holds one product and one grade

-- ── Captures lock once the stop is confirmed ────────────────────────────────
create or replace function private.agent_can_capture(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.produce_listings l
    join public.route_lots rl on rl.lot_id = l.lot_id
    join public.routes r on r.id = rl.route_id
    where l.id = p_listing
      and r.agent_id = (select auth.uid())
      and r.service_date = (timezone('Africa/Accra', now()))::date
      and not exists (
        select 1 from public.route_stops s
        where s.route_id = r.id and s.collection_point_id = l.collection_point_id and s.confirmed_at is not null
      )
  );
$$;

-- ── Driver reads the agent's captures ───────────────────────────────────────
create or replace function private.driver_can_view_capture(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.captures c
    join public.produce_listings l on l.id = c.listing_id
    join public.route_lots rl on rl.lot_id = l.lot_id
    join public.routes r on r.id = rl.route_id
    where c.photo_path = p_path and r.driver_id = (select auth.uid())
  );
$$;

revoke all on function private.driver_can_view_capture(text) from public, anon;
grant execute on function private.driver_can_view_capture(text) to authenticated;

drop policy if exists captures_storage_select_driver on storage.objects;
create policy captures_storage_select_driver on storage.objects
  for select to authenticated
  using (bucket_id = 'captures' and (select private.driver_can_view_capture(name)));

create or replace function public.driver_stop_captures(p_stop_id uuid)
returns table (listing_id uuid, farmer text, product text, listed_kg numeric, grade text, recorded_kg numeric, captured_grade text, photo_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_driver()) then raise exception 'driver only'; end if;
  return query
  select l.id, coalesce(p.display_name, 'Farmer'), l.product, l.weight_kg, l.grade, c.recorded_kg, c.grade, c.photo_path
  from public.route_stops s
  join public.routes r on r.id = s.route_id
  join public.route_lots rl on rl.route_id = s.route_id
  join public.produce_listings l on l.lot_id = rl.lot_id and l.collection_point_id = s.collection_point_id
  left join public.captures c on c.listing_id = l.id
  left join public.profiles p on p.id = l.farmer_id
  where s.id = p_stop_id and r.driver_id = (select auth.uid())
  order by p.display_name;
end;
$$;

create or replace function public.driver_delivery_photos(p_route_id uuid)
returns table (lot_id uuid, photo_path text, received_by text, delivered_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_driver()) then raise exception 'driver only'; end if;
  return query
  select rl.lot_id, rl.delivery_photo_path, rl.received_by, rl.delivered_at
  from public.route_lots rl join public.routes r on r.id = rl.route_id
  where rl.route_id = p_route_id and r.driver_id = (select auth.uid()) and rl.delivered_at is not null;
end;
$$;

revoke all on function public.driver_stop_captures(uuid), public.driver_delivery_photos(uuid) from public, anon;
grant execute on function public.driver_stop_captures(uuid), public.driver_delivery_photos(uuid) to authenticated;

-- ── One product, one grade per lot ──────────────────────────────────────────
alter table public.lots add column if not exists grade text check (grade in ('A', 'B', 'C'));

create or replace function public.create_lot(p_listing_ids uuid[], p_price_per_kg numeric, p_requirement_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n int;
  products int;
  grades int;
  kg numeric;
  prod text;
  grd text;
  new_id uuid;
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if p_price_per_kg is null or p_price_per_kg <= 0 then
    raise exception 'a lot needs a price per kg';
  end if;

  select count(*), count(distinct product), count(distinct grade), coalesce(sum(weight_kg), 0), min(product), min(grade)
    into n, products, grades, kg, prod, grd
    from (
      select product, grade, weight_kg from public.produce_listings
      where id = any (p_listing_ids) and lot_id is null
      for update
    ) l;

  if coalesce(cardinality(p_listing_ids), 0) = 0 or n <> cardinality(p_listing_ids) then
    raise exception 'some listings are missing or already in a lot';
  end if;
  if products <> 1 then
    raise exception 'a lot holds one product';
  end if;
  if grades <> 1 then
    raise exception 'a lot holds one grade';
  end if;
  if kg > 3000 then
    raise exception 'a lot cannot exceed 3,000 kg';
  end if;

  if p_requirement_id is not null then
    perform 1 from public.requirements where id = p_requirement_id and state = 'open' and product = prod for update;
    if not found then
      raise exception 'requirement is not open or is for another product';
    end if;
  end if;

  insert into public.lots (product, grade, total_kg, price_per_kg, requirement_id, created_by)
  values (prod, grd, kg, p_price_per_kg, p_requirement_id, uid) returning id into new_id;
  update public.produce_listings set lot_id = new_id where id = any (p_listing_ids);
  if p_requirement_id is not null then
    update public.requirements set state = 'matched' where id = p_requirement_id;
  end if;
  return new_id;
end;
$$;
