-- Addresses are picked on a map: exact coordinates plus structured detail fields.
-- address stays the map-derived street address; line1 (flat/house/building) and landmark are typed by the user.
-- Existing rows keep working: all new columns are nullable.

alter table public.buyer_addresses
  add column latitude double precision,
  add column longitude double precision,
  add column line1 text,
  add column landmark text,
  add column city text,
  add column postcode text,
  drop constraint buyer_addresses_address_len,
  add constraint buyer_addresses_address_len check (char_length(address) between 2 and 240),
  add constraint buyer_addresses_lat_range check (latitude is null or latitude between -90 and 90),
  add constraint buyer_addresses_lng_range check (longitude is null or longitude between -180 and 180),
  add constraint buyer_addresses_location_pair check ((latitude is null) = (longitude is null)),
  add constraint buyer_addresses_detail_len check (
    char_length(line1) <= 80 and char_length(landmark) <= 80 and char_length(city) <= 80 and char_length(postcode) <= 20);

alter table public.farmers
  add column line1 text,
  add column landmark text,
  add column city text,
  add column postcode text,
  add constraint farmers_detail_len check (
    char_length(line1) <= 80 and char_length(landmark) <= 80 and char_length(city) <= 80 and char_length(postcode) <= 20);

-- The default address is mirrored (line1 first) into buyers.delivery_location for route plans and ops screens.
alter table public.buyers
  drop constraint buyers_location_len,
  add constraint buyers_location_len check (char_length(delivery_location) = 0 or char_length(delivery_location) between 2 and 330);

create or replace function private.sync_buyer_location(p_buyer uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.buyers b
     set delivery_location = coalesce(
       (select concat_ws(', ', nullif(a.line1, ''), a.address)
          from public.buyer_addresses a where a.buyer_id = b.id and a.is_default), '')
   where b.id = p_buyer;
$$;
revoke all on function private.sync_buyer_location(uuid) from public, anon, authenticated;

drop function public.save_buyer_address(uuid, text, text);

create function public.save_buyer_address(
  p_id uuid, p_label text, p_address text, p_line1 text, p_landmark text, p_city text, p_postcode text,
  p_latitude double precision, p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if not exists (select 1 from public.buyers where id = uid) then
    raise exception 'not a buyer';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'location required';
  end if;
  if p_id is null then
    if (select count(*) from public.buyer_addresses where buyer_id = uid) >= 5 then
      raise exception 'address limit reached';
    end if;
    insert into public.buyer_addresses (buyer_id, label, address, line1, landmark, city, postcode, latitude, longitude, is_default)
    values (uid, btrim(p_label), btrim(p_address), nullif(btrim(p_line1), ''), nullif(btrim(p_landmark), ''),
            nullif(btrim(p_city), ''), nullif(btrim(p_postcode), ''), p_latitude, p_longitude,
            not exists (select 1 from public.buyer_addresses where buyer_id = uid));
  else
    update public.buyer_addresses
       set label = btrim(p_label), address = btrim(p_address), line1 = nullif(btrim(p_line1), ''),
           landmark = nullif(btrim(p_landmark), ''), city = nullif(btrim(p_city), ''),
           postcode = nullif(btrim(p_postcode), ''), latitude = p_latitude, longitude = p_longitude
     where id = p_id and buyer_id = uid;
    if not found then
      raise exception 'address not found';
    end if;
  end if;
  perform private.sync_buyer_location(uid);
end;
$$;

revoke all on function public.save_buyer_address(uuid, text, text, text, text, text, text, double precision, double precision) from public, anon;
grant execute on function public.save_buyer_address(uuid, text, text, text, text, text, text, double precision, double precision) to authenticated;

drop function public.save_farmer_details(text, text, text, double precision, double precision);

create function public.save_farmer_details(
  p_name text, p_address text, p_locality text, p_latitude double precision, p_longitude double precision,
  p_line1 text, p_landmark text, p_city text, p_postcode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  update public.farmers
     set address = btrim(p_address),
         locality = nullif(btrim(p_locality), ''),
         latitude = p_latitude,
         longitude = p_longitude,
         line1 = nullif(btrim(p_line1), ''),
         landmark = nullif(btrim(p_landmark), ''),
         city = nullif(btrim(p_city), ''),
         postcode = nullif(btrim(p_postcode), '')
   where id = uid;
  if not found then
    raise exception 'not a farmer';
  end if;
  update public.profiles set display_name = btrim(p_name) where id = uid;
end;
$$;

revoke all on function public.save_farmer_details(text, text, text, double precision, double precision, text, text, text, text) from public, anon;
grant execute on function public.save_farmer_details(text, text, text, double precision, double precision, text, text, text, text) to authenticated;
