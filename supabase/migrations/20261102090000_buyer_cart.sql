-- Server-side cart so a buyer's cart follows them across devices. Prices and stock are never stored here;
-- checkout_cart() still validates every line against live supply. Read-only for clients; save_cart() replaces the cart.

create table public.cart_lines (
  buyer_id uuid not null references public.buyers (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  grade text not null check (grade in ('A', 'B', 'C')),
  kg numeric(10, 2) not null check (kg > 0 and kg <= 30000),
  updated_at timestamptz not null default now(),
  primary key (buyer_id, product_id, grade)
);

alter table public.cart_lines enable row level security;
revoke all on table public.cart_lines from anon, authenticated;
grant select on table public.cart_lines to authenticated;
create policy cart_lines_select_own on public.cart_lines for select to authenticated
  using ((select auth.uid()) = buyer_id);

-- p_items: [{"product_id": uuid, "grade": "A", "kg": 40}, ...]. An empty array empties the cart.
-- Lines for products that no longer exist are dropped silently; a repeated product+grade keeps its last quantity.
create or replace function public.save_cart(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if not (select private.is_buyer()) then
    raise exception 'buyers only';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'cart must have 0 to 50 items';
  end if;

  delete from public.cart_lines where buyer_id = uid;
  insert into public.cart_lines (buyer_id, product_id, grade, kg)
  select distinct on (i.product_id, i.grade) uid, i.product_id, i.grade, i.kg
    from jsonb_to_recordset(p_items) as i(product_id uuid, grade text, kg numeric)
   where i.grade in ('A', 'B', 'C') and i.kg > 0 and i.kg <= 30000
     and exists (select 1 from public.products p where p.id = i.product_id)
   order by i.product_id, i.grade;
end;
$$;
revoke all on function public.save_cart(jsonb) from public, anon;
grant execute on function public.save_cart(jsonb) to authenticated;
