-- Paystack checkout for buyer orders. An order can be paid by manual bank transfer (ops confirms) or online
-- through Paystack (webhook confirms). Each Paystack attempt is a row in payments, so a failed or abandoned
-- attempt can be retried while the order stays awaiting_payment.

alter table public.orders drop constraint orders_method_check;
alter table public.orders add constraint orders_method_check check (method in ('bank_transfer', 'paystack'));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  reference text not null unique,
  amount_pesewas bigint not null check (amount_pesewas > 0),
  -- pending -> success | failed | abandoned; mismatch = paid less than due; orphaned = paid after the order was cancelled (refund it)
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned', 'mismatch', 'orphaned')),
  channel text,
  gateway_response text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payments_order_idx on public.payments (order_id, created_at desc);

alter table public.payments enable row level security;
revoke all on table public.payments from anon, authenticated;
grant select on public.payments to authenticated;
-- Writes happen only in the paystack-* edge functions (service role).

create policy payments_select_own on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));
create policy payments_select_ops on public.payments for select to authenticated using ((select private.is_ops()));

-- Called by the webhook / verify endpoint once Paystack reports a successful charge. Idempotent: Paystack
-- retries webhooks and the app may also call verify, so the same reference can arrive many times.
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
  else
    update public.payments set status = 'orphaned', channel = p_channel, paid_at = now() where id = pay.id;
  end if;
end;
$$;

-- A failed or abandoned attempt; never downgrades a payment that already succeeded.
create or replace function public.fail_paystack_payment(p_reference text, p_status text, p_message text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payments
     set status = p_status, gateway_response = left(p_message, 200)
   where reference = p_reference and status = 'pending' and p_status in ('failed', 'abandoned');
$$;

revoke all on function public.settle_paystack_payment(text, bigint, text, text), public.fail_paystack_payment(text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_paystack_payment(text, bigint, text, text), public.fail_paystack_payment(text, text, text)
  to service_role;

comment on table public.payments is 'One row per Paystack checkout attempt for an order; written by edge functions only.';
