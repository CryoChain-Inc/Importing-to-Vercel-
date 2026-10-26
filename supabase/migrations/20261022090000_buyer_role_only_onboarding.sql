-- Role selection no longer collects a profile: buyers pick the role, then fill in details inside the app
-- (update_buyer_details). The buyers row starts empty, mirroring complete_farmer_onboarding().

alter table public.buyers
  alter column organization_name set default '',
  alter column delivery_location set default '',
  drop constraint buyers_organization_len,
  drop constraint buyers_location_len,
  add constraint buyers_organization_len check (char_length(organization_name) = 0 or char_length(organization_name) between 2 and 120),
  add constraint buyers_location_len check (char_length(delivery_location) = 0 or char_length(delivery_location) between 2 and 80);

drop function public.complete_buyer_onboarding(text, text, text);

create function public.complete_buyer_onboarding()
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
  update public.profiles set role = 'buyer' where id = uid and role = 'pending';
  if not found then
    raise exception 'already onboarded';
  end if;
  insert into public.buyers (id) values (uid);
end;
$$;

revoke all on function public.complete_buyer_onboarding() from public, anon;
grant execute on function public.complete_buyer_onboarding() to authenticated;
