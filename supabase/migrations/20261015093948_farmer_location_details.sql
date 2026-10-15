-- Farmers share their GPS position; "nearest town" becomes a collection point (name + address); language is no longer asked.
alter table public.farmers
  add column latitude double precision,
  add column longitude double precision,
  add constraint farmers_lat_range check (latitude is null or latitude between -90 and 90),
  add constraint farmers_lng_range check (longitude is null or longitude between -180 and 180),
  add constraint farmers_location_pair check ((latitude is null) = (longitude is null)),
  drop constraint farmers_locality_len,
  add constraint farmers_locality_len check (locality is null or char_length(locality) <= 200);

drop function public.save_farmer_details(text, text, text, text);

create function public.save_farmer_details(
  p_name text, p_address text, p_locality text, p_latitude double precision, p_longitude double precision
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
         longitude = p_longitude
   where id = uid;
  if not found then
    raise exception 'not a farmer';
  end if;
  update public.profiles set display_name = btrim(p_name) where id = uid;
end;
$$;

revoke all on function public.save_farmer_details(text, text, text, double precision, double precision) from public, anon;
grant execute on function public.save_farmer_details(text, text, text, double precision, double precision) to authenticated;
