-- Buyer identity lives in one place: profiles holds the person's name, phone and email
-- (phone/email are synced from auth.users, so they are always verified); buyers keeps only
-- organization details. buyers.contact_name/phone/email are dropped; business_name -> organization_name.

-- The buyer's own name moves to profiles.display_name (it used to hold the business name).
update public.profiles p
   set display_name = b.contact_name
  from public.buyers b
 where b.id = p.id;

alter table public.buyers rename column business_name to organization_name;
alter table public.buyers rename constraint buyers_business_len to buyers_organization_len;
-- Dropping the columns also drops their check constraints.
alter table public.buyers drop column contact_name, drop column phone, drop column email;

drop function public.complete_buyer_onboarding(text, text, text, text, text);
drop function public.update_buyer_details(text, text, text, text, text);

create function public.complete_buyer_onboarding(p_organization text, p_name text, p_location text)
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
  update public.profiles
     set role = 'buyer', display_name = btrim(p_name)
   where id = uid and role = 'pending';
  if not found then
    raise exception 'already onboarded';
  end if;
  insert into public.buyers (id, organization_name, delivery_location)
  values (uid, btrim(p_organization), btrim(p_location));
end;
$$;

create function public.update_buyer_details(p_organization text, p_name text, p_location text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  update public.buyers
     set organization_name = btrim(p_organization), delivery_location = btrim(p_location)
   where id = uid;
  if not found then
    raise exception 'not a buyer';
  end if;
  update public.profiles set display_name = btrim(p_name) where id = uid;
end;
$$;

revoke all on function public.complete_buyer_onboarding(text, text, text),
  public.update_buyer_details(text, text, text) from public, anon;
grant execute on function public.complete_buyer_onboarding(text, text, text),
  public.update_buyer_details(text, text, text) to authenticated;

comment on table public.buyers is 'Buyer organization details; name, phone and email live on profiles.';
