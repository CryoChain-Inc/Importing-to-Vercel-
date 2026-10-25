-- Cart checkout: one order, many items. checkout_cart() validates every line against live supply, holds the kg and
-- creates an awaiting_payment order; Paystack payment commits the holds. The v1 whole-lot path keeps working.

alter table public.orders
  alter column lot_id drop not null,
  add column delivery_address_id uuid references public.buyer_addresses (id) on delete set null,
  add column delivery_address text,
  add column delivery_lat double precision,
  add column delivery_lng double precision;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  grade text not null check (grade in ('A', 'B', 'C')),
  kg numeric(10, 2) not null check (kg > 0),
  unit_price numeric(10, 2) not null check (unit_price > 0),
  line_total numeric(12, 2) not null check (line_total > 0),
  unique (order_id, product_id, grade)
);

alter table public.order_items enable row level security;
revoke all on table public.order_items from anon, authenticated;
grant select on public.order_items to authenticated;
create policy order_items_select_own on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));
create policy order_items_select_ops on public.order_items for select to authenticated
  using ((select private.is_ops()));

-- p_items: [{"product_id": uuid, "grade": "A", "kg": 40}, ...]. Returns
--   {ok: true, order_id}  or  {ok: false, shortfalls: [{product_id, grade, requested_kg, available_kg}]}.
-- Nothing is held unless every line fits.
create or replace function public.checkout_cart(p_items jsonb, p_address_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  addr public.buyer_addresses;
  line record;
  avail numeric;
  lines jsonb;
  shortfalls jsonb := '[]'::jsonb;
  new_id uuid;
  total numeric(12, 2);
  -- shortcut: fixed 30 minute hold (matches the Paystack pending window), move to ops_config if ops need to tune it.
  hold_until timestamptz := now() + interval '30 minutes';
begin
  if not (select private.is_buyer()) then
    raise exception 'buyers only';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'cart must have 1 to 50 items';
  end if;

  select * into addr from public.buyer_addresses where id = p_address_id and buyer_id = uid;
  if not found then
    raise exception 'choose a delivery address';
  end if;
  if addr.latitude is null then
    raise exception 'pin your delivery address on the map first';
  end if;

  -- Merge duplicate lines and price them; a line that is not for sale makes the whole cart invalid.
  select jsonb_agg(jsonb_build_object('product_id', q.product_id, 'grade', q.grade, 'kg', q.kg, 'price', q.price)
                   order by q.product_id, q.grade)
    into lines
  from (
    select i.product_id, i.grade, sum(i.kg) as kg, bp.price
    from jsonb_to_recordset(p_items) as i(product_id uuid, grade text, kg numeric)
    join public.buyer_prices bp on bp.product_id = i.product_id and bp.grade = i.grade
    join public.products p on p.id = i.product_id and p.active
    where i.kg > 0 and i.kg <= 30000
    group by i.product_id, i.grade, bp.price
  ) q;

  if lines is null or jsonb_array_length(lines) <> (
       select count(distinct (i.product_id, i.grade)) from jsonb_to_recordset(p_items) as i(product_id uuid, grade text, kg numeric)) then
    raise exception 'an item in your cart is not for sale';
  end if;

  -- Serialize checkouts per product+grade; lines are sorted so two carts cannot deadlock.
  for line in select * from jsonb_to_recordset(lines) as x(product_id uuid, grade text, kg numeric, price numeric) loop
    perform pg_advisory_xact_lock(hashtextextended(line.product_id::text || line.grade, 0));
  end loop;

  for line in select * from jsonb_to_recordset(lines) as x(product_id uuid, grade text, kg numeric, price numeric) loop
    avail := private.available_kg(line.product_id, line.grade);
    if line.kg > avail then
      shortfalls := shortfalls || jsonb_build_object(
        'product_id', line.product_id, 'grade', line.grade, 'requested_kg', line.kg, 'available_kg', avail);
    end if;
  end loop;
  if jsonb_array_length(shortfalls) > 0 then
    return jsonb_build_object('ok', false, 'shortfalls', shortfalls);
  end if;

  select round(sum(x.kg * x.price), 2) into total
    from jsonb_to_recordset(lines) as x(product_id uuid, grade text, kg numeric, price numeric);
  insert into public.orders (buyer_id, amount, delivery_address_id, delivery_address, delivery_lat, delivery_lng)
  values (uid, total, addr.id, addr.address, addr.latitude, addr.longitude)
  returning id into new_id;

  insert into public.order_items (order_id, product_id, grade, kg, unit_price, line_total)
  select new_id, x.product_id, x.grade, x.kg, x.price, round(x.kg * x.price, 2)
    from jsonb_to_recordset(lines) as x(product_id uuid, grade text, kg numeric, price numeric);
  insert into public.supply_holds (order_id, product_id, grade, kg, expires_at)
  select new_id, x.product_id, x.grade, x.kg, hold_until
    from jsonb_to_recordset(lines) as x(product_id uuid, grade text, kg numeric, price numeric);

  return jsonb_build_object('ok', true, 'order_id', new_id);
end;
$$;

revoke all on function public.checkout_cart(jsonb, uuid) from public, anon;
grant execute on function public.checkout_cart(jsonb, uuid) to authenticated;

-- Before opening a Paystack checkout: a cart order whose holds lapsed is cancelled instead of charged.
create or replace function public.cart_order_ready(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.supply_holds h where h.order_id = p_order_id and h.state = 'held' and h.expires_at <= now()) then
    update public.supply_holds set state = 'released' where order_id = p_order_id and state = 'held';
    update public.orders set state = 'cancelled' where id = p_order_id and state = 'awaiting_payment';
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.cart_order_ready(uuid) from public, anon, authenticated;
grant execute on function public.cart_order_ready(uuid) to service_role;

-- cancel_order: cart orders (no lot) just release their holds; the v1 lot path is unchanged.
create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ord public.orders;
  lot public.lots;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select * into ord from public.orders where id = p_order_id for update;
  if not found or ord.state <> 'awaiting_payment'
     or not (ord.buyer_id = uid or (select private.is_ops())) then
    raise exception 'order cannot be cancelled';
  end if;

  if ord.lot_id is not null then
    select * into lot from public.lots where id = ord.lot_id for update;
    if not found or lot.state not in ('escrow_pending', 'listed') then
      raise exception 'order cannot be cancelled';
    end if;
  end if;

  update public.orders set state = 'cancelled' where id = ord.id;
  update public.supply_holds set state = 'released' where order_id = ord.id and state = 'held';

  update public.payments
     set status = 'abandoned', gateway_response = 'order cancelled'
   where order_id = ord.id and status = 'pending';

  if ord.lot_id is not null and lot.state = 'escrow_pending' then
    update public.lots
       set state = 'listed',
           sale_date = (now() at time zone 'Africa/Accra')::date
     where id = lot.id;
  end if;
end;
$$;

revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;

-- settle_paystack_payment: payment on a cart order commits its holds. A late webhook after the hold lapsed still
-- commits (the money is in); refunding an oversold order belongs to the refund step of the autonomous plan.
create or replace function public.settle_paystack_payment(p_reference text, p_paid_pesewas bigint, p_currency text, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments;
  ord public.orders;
begin
  select * into pay from public.payments where reference = p_reference for update;
  if not found then
    raise exception 'unknown payment reference';
  end if;
  if pay.status in ('success', 'orphaned') then
    return;
  end if;
  if p_currency <> 'GHS' or p_paid_pesewas < pay.amount_pesewas then
    update public.payments set status = 'mismatch', channel = p_channel where id = pay.id;
    return;
  end if;

  select * into ord from public.orders where id = pay.order_id for update;
  if ord.state = 'awaiting_payment' then
    update public.payments set status = 'success', channel = p_channel, paid_at = now() where id = pay.id;
    update public.orders set state = 'paid', method = 'paystack', paid_at = now() where id = ord.id;
    update public.lots set state = 'escrow_funded' where id = ord.lot_id and state = 'escrow_pending';
    update public.supply_holds set state = 'committed' where order_id = ord.id and state = 'held';
  else
    update public.payments set status = 'orphaned', channel = p_channel, paid_at = now() where id = pay.id;
  end if;
end;
$$;

revoke all on function public.settle_paystack_payment(text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.settle_paystack_payment(text, bigint, text, text) to service_role;
