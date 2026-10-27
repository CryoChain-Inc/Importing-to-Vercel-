-- Newest products first in the shop and ops lists, and a buyer-readable view of how far each paid order has travelled.

-- ── Products: created/updated timestamps (updated_at moves on every edit) ───
alter table public.products
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_touch_updated_at
before update on public.products
for each row execute function private.touch_updated_at();

create index products_updated_idx on public.products (updated_at desc);

-- ── Shop catalogue: newest product first (same columns as before) ───────────
create or replace function public.buyer_catalogue()
returns table (
  product_id uuid,
  product_name text,
  product_image text,
  product_images text[],
  product_description text,
  category_id uuid,
  category_name text,
  category_image text,
  grade text,
  price numeric,
  available_kg numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.image_path,
    p.image_paths,
    p.description,
    c.id,
    c.name,
    c.image_path,
    bp.grade,
    bp.price,
    private.available_kg(p.id, bp.grade)
  from public.buyer_prices bp
  join public.products p on p.id = bp.product_id and p.active
  join public.categories c on c.id = p.category_id and c.active
  where (select private.is_buyer()) or (select private.is_ops())
  order by p.created_at desc, p.id, bp.grade;
$$;

-- ── Order tracking: delivery stops are driver/ops-only, so buyers read a summary through this function ──
create function public.buyer_order_progress()
returns table (order_id uuid, pickups_total integer, pickups_done integer, delivered_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    (count(*) filter (where s.kind = 'pickup'))::integer,
    (count(*) filter (where s.kind = 'pickup' and s.state = 'done'))::integer,
    max(s.done_at) filter (where s.kind = 'dropoff' and s.state = 'done')
  from public.orders o
  left join public.delivery_stops s on s.order_id = o.id
  where o.buyer_id = (select auth.uid())
  group by o.id;
$$;

revoke all on function public.buyer_order_progress() from public, anon;
grant execute on function public.buyer_order_progress() to authenticated;
