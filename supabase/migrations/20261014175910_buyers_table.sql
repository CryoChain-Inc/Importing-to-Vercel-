-- Buyer details live in public.buyers (one row per buyer profile), mirroring public.farmers.
-- Rows are created only by complete_buyer_onboarding(), which also sets the role on profiles.

create table public.buyers (
  id uuid primary key references public.profiles (id) on delete cascade,
  business_name text not null,
  contact_name text not null,
  phone text,
  email text,
  delivery_location text not null,
  created_at timestamptz not null default now(),
  constraint buyers_business_len check (char_length(business_name) between 2 and 120),
  constraint buyers_contact_len check (char_length(contact_name) between 2 and 80),
  constraint buyers_phone check (phone is null or phone ~ '^233[0-9]{9}$'),
  constraint buyers_email_len check (email is null or char_length(email) <= 254),
  constraint buyers_location_len check (char_length(delivery_location) between 2 and 80)
);

alter table public.buyers enable row level security;

create policy buyers_select_own on public.buyers
  for select to authenticated using ((select auth.uid()) = id);

-- Read-only for clients; writes go through complete_buyer_onboarding().
revoke all on table public.buyers from anon, authenticated;
grant select on table public.buyers to authenticated;

create or replace function public.complete_buyer_onboarding(
  p_business text, p_contact text, p_phone text, p_email text, p_location text
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
  update public.profiles
     set role = 'buyer', display_name = btrim(p_business)
   where id = uid and role = 'pending';
  if not found then
    raise exception 'already onboarded';
  end if;
  insert into public.buyers (id, business_name, contact_name, phone, email, delivery_location)
  values (uid, btrim(p_business), btrim(p_contact), nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''), btrim(p_location));
end;
$$;

revoke all on function public.complete_buyer_onboarding(text, text, text, text, text) from public, anon;
grant execute on function public.complete_buyer_onboarding(text, text, text, text, text) to authenticated;

-- Superseded: it set the buyer role without creating a buyers row.
drop function if exists public.complete_onboarding(text, text);

-- Backfill buyers onboarded before this table existed (their details were never stored).
insert into public.buyers (id, business_name, contact_name, phone, email, delivery_location)
select id, coalesce(nullif(btrim(display_name), ''), 'Unknown business'), coalesce(nullif(btrim(display_name), ''), 'Unknown'),
       case when phone ~ '^233[0-9]{9}$' then phone end, email, 'Accra'
from public.profiles where role = 'buyer'
on conflict (id) do nothing;

comment on table public.buyers is 'Buyer business details; one row per buyer profile.';
