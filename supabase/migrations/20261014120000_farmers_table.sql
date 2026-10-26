-- Farmer data moves out of the shared profiles table into public.farmers.
-- Choosing "farmer" at role selection creates the farmers row; listing needs a saved MoMo wallet.
-- Removes the password-account/synthetic-email path and the bank columns from profiles.

create table public.farmers (
  id uuid primary key references public.profiles (id) on delete cascade,
  address text,
  locality text,
  language text,
  momo_network text,
  momo_number text,
  momo_name text,
  wallet_verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint farmers_address_len check (address is null or char_length(btrim(address)) between 3 and 240),
  constraint farmers_locality_len check (locality is null or char_length(locality) <= 80),
  constraint farmers_language_len check (language is null or char_length(language) <= 40),
  constraint farmers_momo_network check (momo_network is null or momo_network in ('MTN MoMo', 'Telecel Cash', 'AirtelTigo Money')),
  constraint farmers_momo_number check (momo_number is null or momo_number ~ '^233[0-9]{9}$'),
  constraint farmers_momo_name_len check (momo_name is null or char_length(btrim(momo_name)) between 2 and 80),
  -- a wallet is all-or-nothing
  constraint farmers_wallet_complete check (
    (momo_network is null and momo_number is null and momo_name is null)
    or (momo_network is not null and momo_number is not null and momo_name is not null)
  )
);

alter table public.farmers enable row level security;

create policy farmers_select_own on public.farmers
  for select to authenticated using ((select auth.uid()) = id);

create policy farmers_update_own on public.farmers
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Rows are created only by complete_farmer_onboarding(); details are saved through save_farmer_details(); wallet_verified_at is staff-only.
revoke all on table public.farmers from anon, authenticated;
grant select on table public.farmers to authenticated;
grant update (address, locality, language, momo_network, momo_number, momo_name) on table public.farmers to authenticated;

-- Carry over farmers created by the earlier bank-details flow (bank data is dropped).
insert into public.farmers (id, address)
select id, nullif(btrim(address), '')
from public.profiles
where role = 'farmer'
on conflict (id) do nothing;

-- Remove the second auth path and the profile self-update surface.
drop trigger if exists profiles_guard_update on public.profiles;
drop function if exists private.guard_profile_update();
drop trigger if exists confirm_synthetic_farmer on auth.users;
drop function if exists private.confirm_synthetic_farmer();
drop policy if exists profiles_update_own on public.profiles;
revoke update on table public.profiles from authenticated;

alter table public.profiles
  drop column if exists address,
  drop column if exists bank_name,
  drop column if exists account_holder,
  drop column if exists account_number,
  drop column if exists updated_at;

-- Role selection for farmers: set the role and create the (empty) farmers row in one step.
create or replace function public.complete_farmer_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  update public.profiles set role = 'farmer' where id = uid and role = 'pending';
  if not found then
    raise exception 'already onboarded';
  end if;
  insert into public.farmers (id) values (uid);
end;
$$;

-- Profile step of the farmer wizard: name lives on profiles, which clients cannot update directly.
create or replace function public.save_farmer_details(
  p_name text, p_address text, p_locality text, p_language text
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
         language = nullif(btrim(p_language), '')
   where id = uid;
  if not found then
    raise exception 'not a farmer';
  end if;
  update public.profiles set display_name = btrim(p_name) where id = uid;
end;
$$;

revoke all on function public.complete_farmer_onboarding() from public, anon;
grant execute on function public.complete_farmer_onboarding() to authenticated;
revoke all on function public.save_farmer_details(text, text, text, text) from public, anon;
grant execute on function public.save_farmer_details(text, text, text, text) to authenticated;

-- complete_onboarding() stays for buyers only; farmers must go through the function above.
create or replace function public.complete_onboarding(new_role text, new_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new_role <> 'buyer' then
    raise exception 'invalid role';
  end if;
  update public.profiles
     set role = new_role, display_name = new_name
   where id = (select auth.uid()) and role = 'pending';
  if not found then
    raise exception 'already onboarded';
  end if;
end;
$$;

-- Listings belong to farmers, and need a saved wallet to be created.
alter table public.produce_listings drop constraint if exists produce_listings_farmer_id_fkey;
alter table public.produce_listings
  add constraint produce_listings_farmer_id_fkey
  foreign key (farmer_id) references public.farmers (id) on delete cascade;

drop policy if exists produce_listings_select_own on public.produce_listings;
create policy produce_listings_select_own on public.produce_listings
  for select to authenticated using (farmer_id = (select auth.uid()));

drop policy if exists produce_listings_insert_own on public.produce_listings;
create policy produce_listings_insert_own on public.produce_listings
  for insert to authenticated
  with check (
    farmer_id = (select auth.uid())
    and exists (
      select 1 from public.farmers f
      where f.id = (select auth.uid()) and f.momo_number is not null
    )
  );

comment on table public.farmers is 'Farmer details and MoMo payout wallet; one row per farmer profile.';
