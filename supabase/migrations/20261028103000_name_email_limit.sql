-- Names and organization names are capped at 60 characters. Existing longer values are shortened
-- so the new checks can be added. Email length is enforced in the app (auth may still store a longer address).

update public.profiles
   set display_name = left(display_name, 60)
 where display_name is not null and char_length(display_name) > 60;

alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) <= 60);

update public.buyers
   set organization_name = left(organization_name, 60)
 where char_length(organization_name) > 60;

alter table public.buyers drop constraint if exists buyers_organization_len;
alter table public.buyers
  add constraint buyers_organization_len
  check (char_length(organization_name) = 0 or char_length(organization_name) between 2 and 60);

update public.farmers
   set momo_name = left(btrim(momo_name), 60)
 where momo_name is not null and char_length(btrim(momo_name)) > 60;

alter table public.farmers drop constraint if exists farmers_momo_name_len;
alter table public.farmers
  add constraint farmers_momo_name_len
  check (momo_name is null or char_length(btrim(momo_name)) between 2 and 60);

create or replace function public.update_buyer_details(p_organization text, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  org text := btrim(p_organization);
  name text := btrim(p_name);
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if char_length(org) not between 2 and 60 then
    raise exception 'organization must be 2 to 60 characters';
  end if;
  if char_length(name) not between 2 and 60 then
    raise exception 'name must be 2 to 60 characters';
  end if;
  update public.buyers set organization_name = org where id = uid;
  if not found then
    raise exception 'not a buyer';
  end if;
  update public.profiles set display_name = name where id = uid;
end;
$$;

create or replace function public.save_farmer_details(
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
  name text := btrim(p_name);
begin
  if char_length(name) not between 2 and 60 then
    raise exception 'name must be 2 to 60 characters';
  end if;
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
  update public.profiles set display_name = name where id = uid;
end;
$$;

create or replace function public.provision_staff(p_id uuid, p_role text, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text := btrim(p_name);
begin
  if p_role not in ('agent', 'driver', 'ops') then
    raise exception 'invalid staff role';
  end if;
  if char_length(name) not between 2 and 60 then
    raise exception 'name must be 2 to 60 characters';
  end if;
  update public.profiles set role = p_role, display_name = name where id = p_id and role = 'pending';
  if not found then
    raise exception 'profile not pending';
  end if;
  if p_role = 'agent' then
    insert into public.agents (id) values (p_id);
  elsif p_role = 'driver' then
    insert into public.drivers (id) values (p_id);
  end if;
end;
$$;
