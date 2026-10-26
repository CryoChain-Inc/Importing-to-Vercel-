-- Ops dashboard: staff read access to farmers/supply, product catalogue + grade prices (public Grade A),
-- collection points farmers list against, and a single-row operations config.
-- Ops accounts are created by setting profiles.role = 'ops' in the dashboard (clients cannot).

create or replace function private.is_ops()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'ops');
$$;

revoke all on function private.is_ops() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_ops() to authenticated;

-- ── Catalogue and prices ────────────────────────────────────────────────────
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  active boolean not null default true,
  constraint products_name_len check (char_length(btrim(name)) between 2 and 80),
  constraint products_category_len check (char_length(btrim(category)) between 2 and 60)
);

create table public.crop_prices (
  product_id uuid not null references public.products (id) on delete cascade,
  grade text not null check (grade in ('A', 'B', 'C')),
  unit text not null default 'kg',
  price numeric(10, 2) not null check (price > 0 and price <= 100000),
  prev_price numeric(10, 2),
  window_label text,
  updated_at timestamptz not null default now(),
  primary key (product_id, grade)
);

-- prev_price and updated_at are maintained here so clients can't fake the percentage change.
create or replace function private.track_price_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.prev_price := null;
  elsif new.price is distinct from old.price then
    new.prev_price := old.price;
  else
    new.prev_price := old.prev_price;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger crop_prices_track_change
before insert or update on public.crop_prices
for each row execute function private.track_price_change();

-- ── Collection points ───────────────────────────────────────────────────────
create table public.collection_points (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  locality text,
  address text,
  days smallint[] not null default '{1,2,3}',   -- 0 = Sunday … 6 = Saturday
  window_start time not null default '06:00',
  window_end time not null default '10:00',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint collection_points_name_len check (char_length(btrim(name)) between 2 and 80),
  constraint collection_points_days check (cardinality(days) between 1 and 7 and days <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint collection_points_window check (window_end > window_start)
);

create table public.collection_point_products (
  collection_point_id uuid not null references public.collection_points (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  primary key (collection_point_id, product_id)
);
create index collection_point_products_product_idx on public.collection_point_products (product_id);

-- ── Operations config (single row) ──────────────────────────────────────────
create table public.ops_config (
  id boolean primary key default true check (id),
  min_temp_c numeric(4, 1),
  max_temp_c numeric(4, 1),
  payout_threshold_ghs numeric(12, 2) check (payout_threshold_ghs is null or payout_threshold_ghs >= 0),
  transfer_bank_name text,
  transfer_account_name text,
  transfer_account_number text check (transfer_account_number is null or transfer_account_number ~ '^[0-9]{6,20}$'),
  support_phone text,
  updated_at timestamptz not null default now(),
  constraint ops_config_temp_order check (min_temp_c is null or max_temp_c is null or min_temp_c < max_temp_c)
);
insert into public.ops_config (id) values (true);

-- ── Listings point at a collection point ────────────────────────────────────
alter table public.produce_listings
  add column collection_point_id uuid references public.collection_points (id) on delete set null;
create index produce_listings_collection_point_idx on public.produce_listings (collection_point_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.products enable row level security;
alter table public.crop_prices enable row level security;
alter table public.collection_points enable row level security;
alter table public.collection_point_products enable row level security;
alter table public.ops_config enable row level security;

revoke all on table public.products, public.crop_prices, public.collection_points,
  public.collection_point_products, public.ops_config from anon, authenticated;
grant select on public.products, public.crop_prices to anon;
grant select, insert, update, delete on public.products, public.crop_prices,
  public.collection_points, public.collection_point_products to authenticated;
grant select, update on public.ops_config to authenticated;

create policy products_select_active on public.products for select to anon, authenticated using (active);
create policy products_ops_all on public.products for all to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));

-- The public landing page only ever sees Grade A.
create policy crop_prices_select_public on public.crop_prices for select to anon using (grade = 'A');
create policy crop_prices_select_auth on public.crop_prices for select to authenticated using (true);
create policy crop_prices_ops_write on public.crop_prices for all to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));

create policy collection_points_select_active on public.collection_points for select to authenticated using (active);
create policy collection_points_ops_all on public.collection_points for all to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));

create policy cpp_select on public.collection_point_products for select to authenticated using (true);
create policy cpp_ops_all on public.collection_point_products for all to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));

create policy ops_config_ops_select on public.ops_config for select to authenticated using ((select private.is_ops()));
create policy ops_config_ops_update on public.ops_config for update to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));

-- Ops can read farmers, their profiles and their listings (read-only).
create policy profiles_select_ops on public.profiles for select to authenticated using ((select private.is_ops()));
create policy farmers_select_ops on public.farmers for select to authenticated using ((select private.is_ops()));
create policy produce_listings_select_ops on public.produce_listings for select to authenticated using ((select private.is_ops()));

-- New listings must use an active collection point that accepts the product.
drop policy if exists produce_listings_insert_own on public.produce_listings;
create policy produce_listings_insert_own on public.produce_listings
  for insert to authenticated
  with check (
    farmer_id = (select auth.uid())
    and exists (select 1 from public.farmers f where f.id = (select auth.uid()) and f.momo_number is not null)
    and exists (
      select 1
      from public.collection_points cp
      join public.collection_point_products cpp on cpp.collection_point_id = cp.id
      join public.products p on p.id = cpp.product_id
      where cp.id = produce_listings.collection_point_id and cp.active and p.name = produce_listings.product
    )
  );

-- ── Seed from the former demo board so the landing page isn't empty ─────────
insert into public.products (name, category) values
  ('Tomato', 'Vegetables'), ('Pepper', 'Vegetables'), ('Okra', 'Vegetables'),
  ('Cabbage', 'Vegetables'), ('Onion', 'Vegetables');

insert into public.crop_prices (product_id, grade, price, window_label)
select p.id, v.grade, v.price, v.win
from (values
  ('Tomato', 'A', 8.5, 'Mon–Wed collection'), ('Tomato', 'B', 6.8, 'Mon–Wed collection'),
  ('Pepper', 'A', 14, 'Tue–Thu collection'), ('Okra', 'A', 7.2, 'Tue–Thu collection'),
  ('Cabbage', 'B', 4.1, 'Wed collection'), ('Onion', 'A', 9.9, 'Thu–Fri collection')
) as v(name, grade, price, win)
join public.products p on p.name = v.name;

comment on table public.crop_prices is 'Per-product, per-grade farmer price; prev_price is the price before the last change.';
comment on table public.ops_config is 'Single-row operations settings; ops-only (holds transfer account details).';
