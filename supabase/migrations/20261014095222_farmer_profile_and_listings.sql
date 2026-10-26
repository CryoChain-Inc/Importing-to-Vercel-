-- Farmer profile details and harvest listings.
-- Role stays server-controlled: a pending profile becomes a farmer only after
-- name, address, and bank details are saved.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.profiles
  add column if not exists address text,
  add column if not exists bank_name text,
  add column if not exists account_holder text,
  add column if not exists account_number text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles drop constraint if exists profiles_address_len;
alter table public.profiles drop constraint if exists profiles_bank_name_len;
alter table public.profiles drop constraint if exists profiles_account_holder_len;
alter table public.profiles drop constraint if exists profiles_account_number_len;

alter table public.profiles
  add constraint profiles_address_len check (address is null or char_length(btrim(address)) between 3 and 240),
  add constraint profiles_bank_name_len check (bank_name is null or char_length(btrim(bank_name)) between 2 and 80),
  add constraint profiles_account_holder_len check (account_holder is null or char_length(btrim(account_holder)) between 2 and 80),
  add constraint profiles_account_number_len check (account_number is null or account_number ~ '^[0-9]{6,20}$');

create unique index if not exists profiles_phone_unique on public.profiles (phone) where phone is not null;

comment on column public.profiles.address is 'Farm address the agent uses for collection.';
comment on column public.profiles.account_number is 'Bank account paid when an agent collects the farmer''s produce.';

create or replace function private.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'pending'
     and nullif(btrim(new.display_name), '') is not null
     and nullif(btrim(new.address), '') is not null
     and nullif(btrim(new.bank_name), '') is not null
     and nullif(btrim(new.account_holder), '') is not null
     and new.account_number is not null
  then
    new.role := 'farmer';
  else
    new.role := old.role;
  end if;
  new.id := old.id;
  new.email := old.email;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
before update on public.profiles
for each row execute function private.guard_profile_update();

create or replace function private.confirm_synthetic_farmer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email like '%@farmers.cryochain.app' and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists confirm_synthetic_farmer on auth.users;
create trigger confirm_synthetic_farmer
before insert on auth.users
for each row execute function private.confirm_synthetic_farmer();

revoke insert, update, delete, truncate, references, trigger on table public.profiles from anon, authenticated;
grant update (display_name, phone, address, bank_name, account_holder, account_number) on table public.profiles to authenticated;

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create table if not exists public.produce_listings (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references public.profiles (id) on delete cascade,
  product text not null,
  weight_kg numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  constraint produce_listings_product_len check (char_length(btrim(product)) between 2 and 80),
  constraint produce_listings_weight_kg check (weight_kg > 0 and weight_kg <= 100000)
);

create index if not exists produce_listings_farmer_created_idx
  on public.produce_listings (farmer_id, created_at desc);

alter table public.produce_listings enable row level security;

drop policy if exists produce_listings_select_own on public.produce_listings;
create policy produce_listings_select_own
on public.produce_listings
for select
to authenticated
using (
  farmer_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'farmer'
  )
);

drop policy if exists produce_listings_insert_own on public.produce_listings;
create policy produce_listings_insert_own
on public.produce_listings
for insert
to authenticated
with check (
  farmer_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'farmer'
  )
);

drop policy if exists produce_listings_delete_own on public.produce_listings;
create policy produce_listings_delete_own
on public.produce_listings
for delete
to authenticated
using (farmer_id = (select auth.uid()));

revoke all on table public.produce_listings from anon, authenticated;
grant select, insert, delete on table public.produce_listings to authenticated;

comment on table public.produce_listings is 'Farmer harvest listings: one product and its weight.';
