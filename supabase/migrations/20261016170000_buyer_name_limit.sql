-- The buyer's own name lives on profiles.display_name. Cap it at 80 characters,
-- the same limit the old buyers.contact_name column used.

create or replace function public.complete_buyer_onboarding(p_organization text, p_name text, p_location text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  name text := btrim(p_name);
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  if char_length(name) not between 2 and 80 then
    raise exception 'name must be 2 to 80 characters';
  end if;
  update public.profiles
     set role = 'buyer', display_name = name
   where id = uid and role = 'pending';
  if not found then
    raise exception 'already onboarded';
  end if;
  insert into public.buyers (id, organization_name, delivery_location)
  values (uid, btrim(p_organization), btrim(p_location));
end;
$$;

create or replace function public.update_buyer_details(p_organization text, p_name text, p_location text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  name text := btrim(p_name);
begin
  if char_length(name) not between 2 and 80 then
    raise exception 'name must be 2 to 80 characters';
  end if;
  update public.buyers
     set organization_name = btrim(p_organization), delivery_location = btrim(p_location)
   where id = uid;
  if not found then
    raise exception 'not a buyer';
  end if;
  update public.profiles set display_name = name where id = uid;
end;
$$;
