-- Buyer side: today's priced lots, bank-transfer orders that ops confirms, standing requirements, and
-- buyer detail edits. Paystack later adds a payment method; the order state machine stays the same.
--   order: awaiting_payment -> paid | cancelled      lot: listed -> escrow_pending -> escrow_funded
-- Escrow before dispatch (I2): a lot only reaches escrow_funded once ops confirms the transfer arrived.

create or replace function private.is_buyer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'buyer');
$$;

revoke all on function private.is_buyer() from public, anon;
grant execute on function private.is_buyer() to authenticated;

-- ── Requirements (buyers post demand; ops builds a lot against it) ──────────
create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers (id) on delete cascade,
  product text not null,
  grade text not null default 'A' check (grade in ('A', 'B')),
  quantity_kg numeric(10, 2) not null check (quantity_kg > 0 and quantity_kg <= 30000),
  period text not null default 'once' check (period in ('once', 'daily', 'weekly')),
  max_price_per_kg numeric(10, 2) not null check (max_price_per_kg > 0 and max_price_per_kg <= 100000),
  destination text not null check (char_length(btrim(destination)) between 2 and 80),
  state text not null default 'open' check (state in ('open', 'matched', 'closed')),
  created_at timestamptz not null default now()
);
create index requirements_buyer_idx on public.requirements (buyer_id, created_at desc);
create index requirements_open_idx on public.requirements (created_at) where state = 'open';

-- ── Lots get a buyer price, a sale day and an optional requirement ──────────
alter table public.lots
  add column price_per_kg numeric(10, 2) check (price_per_kg > 0 and price_per_kg <= 100000),
  add column sale_date date not null default ((now() at time zone 'Africa/Accra')::date),
  add column requirement_id uuid references public.requirements (id) on delete set null;
-- Today's marketplace: listed, priced lots by day.
create index lots_sale_idx on public.lots (sale_date) where state = 'listed' and price_per_kg is not null;

-- ── Orders ──────────────────────────────────────────────────────────────────
create sequence if not exists public.order_code_seq;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default 'ORD-' || lpad(nextval('public.order_code_seq')::text, 5, '0'),
  buyer_id uuid not null references public.buyers (id),
  lot_id uuid not null references public.lots (id),
  amount numeric(12, 2) not null check (amount > 0),
  method text not null default 'bank_transfer' check (method in ('bank_transfer')),
  state text not null default 'awaiting_payment' check (state in ('awaiting_payment', 'paid', 'cancelled')),
  paid_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create unique index orders_one_active_per_lot on public.orders (lot_id) where state <> 'cancelled';
create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_awaiting_idx on public.orders (created_at) where state = 'awaiting_payment';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.requirements enable row level security;
alter table public.orders enable row level security;

revoke all on table public.requirements, public.orders from anon, authenticated;
grant select on public.orders to authenticated;
grant select on public.requirements to authenticated;
grant insert (buyer_id, product, grade, quantity_kg, period, max_price_per_kg, destination) on public.requirements to authenticated;
grant update (state) on public.requirements to authenticated;
-- Order writes only through place_order() / cancel_order() / confirm_order_payment().

create policy orders_select_own on public.orders for select to authenticated using (buyer_id = (select auth.uid()));
create policy orders_select_ops on public.orders for select to authenticated using ((select private.is_ops()));

create policy requirements_select_own on public.requirements for select to authenticated using (buyer_id = (select auth.uid()));
create policy requirements_select_ops on public.requirements for select to authenticated using ((select private.is_ops()));
create policy requirements_insert_own on public.requirements for insert to authenticated
  with check (buyer_id = (select auth.uid()));
-- A buyer may only close their own open requirement.
create policy requirements_close_own on public.requirements for update to authenticated
  using (buyer_id = (select auth.uid()) and state = 'open')
  with check (buyer_id = (select auth.uid()) and state = 'closed');
create policy requirements_update_ops on public.requirements for update to authenticated
  using ((select private.is_ops())) with check ((select private.is_ops()));

-- Buyers see today's open lots plus any lot they have ordered; ops need buyer details on orders.
create policy lots_select_buyer on public.lots for select to authenticated
using (
  (select private.is_buyer())
  and (
    (state = 'listed' and price_per_kg is not null and sale_date = (now() at time zone 'Africa/Accra')::date)
    or exists (select 1 from public.orders o where o.lot_id = lots.id and o.buyer_id = (select auth.uid()))
  )
);
create policy buyers_select_ops on public.buyers for select to authenticated using ((select private.is_ops()));

-- ── Lots now carry a price and may answer a requirement ─────────────────────
drop function if exists public.create_lot(uuid[]);

create or replace function public.create_lot(p_listing_ids uuid[], p_price_per_kg numeric, p_requirement_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n int;
  products int;
  kg numeric;
  prod text;
  new_id uuid;
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if p_price_per_kg is null or p_price_per_kg <= 0 then
    raise exception 'a lot needs a price per kg';
  end if;

  -- Lock the rows so two ops users can't claim the same listing.
  select count(*), count(distinct product), coalesce(sum(weight_kg), 0), min(product)
    into n, products, kg, prod
    from (
      select product, weight_kg from public.produce_listings
      where id = any (p_listing_ids) and lot_id is null
      for update
    ) l;

  if coalesce(cardinality(p_listing_ids), 0) = 0 or n <> cardinality(p_listing_ids) then
    raise exception 'some listings are missing or already in a lot';
  end if;
  if products <> 1 then
    raise exception 'a lot holds one product';
  end if;
  if kg > 3000 then
    raise exception 'a lot cannot exceed 3,000 kg';
  end if;

  if p_requirement_id is not null then
    perform 1 from public.requirements where id = p_requirement_id and state = 'open' and product = prod for update;
    if not found then
      raise exception 'requirement is not open or is for another product';
    end if;
  end if;

  insert into public.lots (product, total_kg, price_per_kg, requirement_id, created_by)
  values (prod, kg, p_price_per_kg, p_requirement_id, uid) returning id into new_id;
  update public.produce_listings set lot_id = new_id where id = any (p_listing_ids);
  if p_requirement_id is not null then
    update public.requirements set state = 'matched' where id = p_requirement_id;
  end if;
  return new_id;
end;
$$;

-- Cancelling a lot reopens the requirement it answered.
create or replace function public.cancel_lot(p_lot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req uuid;
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  update public.lots set state = 'cancelled' where id = p_lot_id and state = 'listed' returning requirement_id into req;
  if not found then
    raise exception 'lot cannot be cancelled';
  end if;
  update public.produce_listings set lot_id = null where lot_id = p_lot_id;
  update public.requirements set state = 'open' where id = req and state = 'matched';
end;
$$;

-- ── Orders ──────────────────────────────────────────────────────────────────
-- Reserves the lot (listed -> escrow_pending) and snapshots the amount, atomically.
create or replace function public.place_order(p_lot_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  lot public.lots;
  new_id uuid;
begin
  if not (select private.is_buyer()) then
    raise exception 'buyers only';
  end if;
  select * into lot from public.lots where id = p_lot_id for update;
  if not found or lot.state <> 'listed' or lot.price_per_kg is null
     or lot.sale_date <> (now() at time zone 'Africa/Accra')::date then
    raise exception 'lot is no longer available';
  end if;
  insert into public.orders (buyer_id, lot_id, amount)
  values (uid, lot.id, round(lot.total_kg * lot.price_per_kg, 2))
  returning id into new_id;
  update public.lots set state = 'escrow_pending' where id = lot.id;
  return new_id;
end;
$$;

-- Buyer (own order) or ops; only before payment is confirmed. The lot goes back on sale.
create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ord public.orders;
begin
  select * into ord from public.orders where id = p_order_id for update;
  if not found or ord.state <> 'awaiting_payment' or not (ord.buyer_id = uid or (select private.is_ops())) then
    raise exception 'order cannot be cancelled';
  end if;
  update public.orders set state = 'cancelled' where id = ord.id;
  update public.lots set state = 'listed' where id = ord.lot_id and state = 'escrow_pending';
end;
$$;

-- Ops saw the transfer land in the bank account: the order is paid and escrow is funded.
create or replace function public.confirm_order_payment(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.orders;
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  select * into ord from public.orders where id = p_order_id for update;
  if not found or ord.state <> 'awaiting_payment' then
    raise exception 'order is not awaiting payment';
  end if;
  update public.orders set state = 'paid', paid_at = now(), confirmed_by = (select auth.uid()) where id = ord.id;
  update public.lots set state = 'escrow_funded' where id = ord.lot_id and state = 'escrow_pending';
end;
$$;

-- The ops transfer account is shown to buyers only; ops_config itself stays ops-only.
create or replace function public.get_transfer_details()
returns table (bank_name text, account_name text, account_number text, support_phone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_buyer()) then
    raise exception 'buyers only';
  end if;
  return query
    select c.transfer_bank_name, c.transfer_account_name, c.transfer_account_number, c.support_phone
    from public.ops_config c;
end;
$$;

-- Buyer edits their own details; the profile display name follows the business name.
create or replace function public.update_buyer_details(
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
  update public.buyers
     set business_name = btrim(p_business), contact_name = btrim(p_contact),
         phone = nullif(btrim(p_phone), ''), email = nullif(btrim(p_email), ''),
         delivery_location = btrim(p_location)
   where id = uid;
  if not found then
    raise exception 'not a buyer';
  end if;
  update public.profiles set display_name = btrim(p_business) where id = uid;
end;
$$;

revoke all on function public.create_lot(uuid[], numeric, uuid), public.cancel_lot(uuid),
  public.place_order(uuid), public.cancel_order(uuid), public.confirm_order_payment(uuid),
  public.get_transfer_details(), public.update_buyer_details(text, text, text, text, text)
  from public, anon;
grant execute on function public.create_lot(uuid[], numeric, uuid), public.cancel_lot(uuid),
  public.place_order(uuid), public.cancel_order(uuid), public.confirm_order_payment(uuid),
  public.get_transfer_details(), public.update_buyer_details(text, text, text, text, text)
  to authenticated;

comment on table public.orders is 'Buyer purchase of one lot. Bank-transfer orders are confirmed by ops.';
comment on table public.requirements is 'Buyer demand ops can answer by creating a lot.';
