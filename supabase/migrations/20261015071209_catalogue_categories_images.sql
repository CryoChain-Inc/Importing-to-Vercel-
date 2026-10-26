-- Catalogue: categories become a table (ops adds/edits them), products belong to one, both can
-- carry an image stored in the public 'catalogue' bucket. The per-price collection window label is gone.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint categories_name_len check (char_length(btrim(name)) between 2 and 60)
);
create unique index categories_name_key on public.categories (lower(btrim(name)));

insert into public.categories (name)
select distinct btrim(category) from public.products;

alter table public.products
  add column category_id uuid references public.categories (id),
  add column image_path text;

update public.products p set category_id = c.id
  from public.categories c where lower(c.name) = lower(btrim(p.category));

alter table public.products alter column category_id set not null;
alter table public.products drop column category;
create index products_category_idx on public.products (category_id);

alter table public.crop_prices drop column window_label;

-- ── RLS (same shape as products: public reads active rows, ops does everything) ──
alter table public.categories enable row level security;
revoke all on table public.categories from anon, authenticated;
grant select on public.categories to anon;
grant select, insert, update, delete on public.categories to authenticated;

create policy categories_select_active on public.categories for select to anon, authenticated using (active);
create policy categories_ops_all on public.categories for all to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));

-- ── Storage: public-read bucket, ops-only writes (upsert needs insert + select + update) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogue', 'catalogue', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy catalogue_ops_select on storage.objects for select to authenticated
  using (bucket_id = 'catalogue' and (select private.is_ops()));
create policy catalogue_ops_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalogue' and (select private.is_ops()));
create policy catalogue_ops_update on storage.objects for update to authenticated
  using (bucket_id = 'catalogue' and (select private.is_ops()))
  with check (bucket_id = 'catalogue' and (select private.is_ops()));
create policy catalogue_ops_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalogue' and (select private.is_ops()));

comment on table public.categories is 'Product categories managed by ops; image_path is a key in the catalogue bucket.';
