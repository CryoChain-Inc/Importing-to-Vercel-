-- CryoChain operating record.
-- The workspace document is readable and writable only by Edge Functions
-- (service role). Clients never select it, so a buyer cannot download
-- farmer wallet numbers.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('buyer', 'farmer', 'agent', 'driver', 'ops', 'pending')),
  display_name text not null default '',
  phone text,
  org_id text,
  buyer_user_id text,
  farmer_id text,
  ops_user_id text,
  device_id text,
  draft jsonb not null default '{"lines":[],"deliveryDate":"","address":""}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "read own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;

create table public.workspace (
  id int primary key default 1 check (id = 1),
  version bigint not null default 0,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.workspace enable row level security;
-- No policies. The anon and authenticated roles cannot read or write this table.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing int;
begin
  perform pg_advisory_xact_lock(41012026);
  select count(*) into existing from public.profiles;
  insert into public.profiles (id, role, display_name, phone)
  values (
    new.id,
    case when existing = 0 then 'ops' else 'pending' end,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    new.phone
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict (id) do nothing;

create policy "captures insert own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "captures read own or staff"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'captures'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('ops', 'agent', 'driver')
      )
    )
  );
