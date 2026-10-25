-- Second price per product and grade: what buyers pay. crop_prices stays the farmer (farm-gate) price.
-- Kept in its own table so the public Grade A read on crop_prices never exposes it.

create table public.buyer_prices (
  product_id uuid not null references public.products (id) on delete cascade,
  grade text not null check (grade in ('A', 'B', 'C')),
  price numeric(10, 2) not null check (price > 0 and price <= 100000),
  prev_price numeric(10, 2),
  updated_at timestamptz not null default now(),
  primary key (product_id, grade)
);

create trigger buyer_prices_track_change
before insert or update on public.buyer_prices
for each row execute function private.track_price_change();

alter table public.buyer_prices enable row level security;
revoke all on table public.buyer_prices from anon, authenticated;
grant select, insert, update, delete on public.buyer_prices to authenticated;

create policy buyer_prices_select on public.buyer_prices for select to authenticated
  using ((select private.is_ops()) or (select private.is_buyer()));
create policy buyer_prices_ops_write on public.buyer_prices for all to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));

comment on table public.buyer_prices is 'Per-product, per-grade price buyers pay; prev_price is the price before the last change.';
