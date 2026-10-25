-- Buyer shop: what can be bought right now, and holds that stop two checkouts selling the same kg.
-- Supply is open farmer listings (not in a v1 lot, not yet captured) matched to a product by name and grade.
-- Available kg is computed (listings minus live holds), never stored.

create table public.supply_holds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  grade text not null check (grade in ('A', 'B', 'C')),
  kg numeric(10, 2) not null check (kg > 0),
  state text not null default 'held' check (state in ('held', 'committed', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
-- Only live holds count against supply.
create index supply_holds_live_idx on public.supply_holds (product_id, grade) where state <> 'released';
create index supply_holds_order_idx on public.supply_holds (order_id);

alter table public.supply_holds enable row level security;
revoke all on table public.supply_holds from anon, authenticated;
grant select on public.supply_holds to authenticated;
create policy supply_holds_select_own on public.supply_holds for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));
create policy supply_holds_select_ops on public.supply_holds for select to authenticated
  using ((select private.is_ops()));
-- Writes only through checkout_cart() / cancel_order() / settle_paystack_payment().

comment on table public.supply_holds is 'Kg promised to a cart order: held until paid or expired, then committed or released.';

-- Kg of a product+grade a buyer could still buy.
create or replace function private.available_kg(p_product_id uuid, p_grade text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0,
    coalesce((
      select sum(l.weight_kg)
      from public.produce_listings l
      join public.products p on lower(btrim(p.name)) = lower(btrim(l.product))
      where p.id = p_product_id
        and l.grade = p_grade
        and l.lot_id is null
        and not exists (select 1 from public.captures c where c.listing_id = l.id)
    ), 0)
    - coalesce((
      select sum(h.kg)
      from public.supply_holds h
      where h.product_id = p_product_id
        and h.grade = p_grade
        and (h.state = 'committed' or (h.state = 'held' and h.expires_at > now()))
    ), 0)
  );
$$;

revoke all on function private.available_kg(uuid, text) from public, anon, authenticated;

-- The shop: one row per product+grade that has a buyer price and stock. Farmer prices and identities never leave.
create or replace function public.buyer_catalogue()
returns table (
  product_id uuid,
  product_name text,
  product_image text,
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
  select s.* from (
    select
      p.id as product_id,
      p.name as product_name,
      p.image_path as product_image,
      c.id as category_id,
      c.name as category_name,
      c.image_path as category_image,
      bp.grade,
      bp.price,
      private.available_kg(p.id, bp.grade) as available_kg
    from public.buyer_prices bp
    join public.products p on p.id = bp.product_id and p.active
    join public.categories c on c.id = p.category_id and c.active
    where (select private.is_buyer()) or (select private.is_ops())
  ) s
  where s.available_kg > 0
  order by s.category_name, s.product_name, s.grade;
$$;

revoke all on function public.buyer_catalogue() from public, anon;
grant execute on function public.buyer_catalogue() to authenticated;
