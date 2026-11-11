-- refunds: money back to a buyer for the part of an order that could not be supplied.
--   short quantity (order_items.short_kg) x the price the buyer paid -> a refund request -> ops approve ->
--   Paystack refunds the original payment -> the webhook confirms it. Orders paid by bank transfer are refunded by
--   hand and marked done by ops. Nothing is sent to Paystack without an ops user approving that refund.

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  -- The Paystack payment being refunded; null when the order was paid by bank transfer (refunded by hand).
  payment_id uuid references public.payments (id),
  amount numeric(12, 2) not null check (amount > 0),
  reason text not null,
  -- requested -> sending (ops approved, call in flight) -> sent (Paystack accepted) -> refunded | failed
  -- failed can be approved again; rejected and refunded are final.
  status text not null default 'requested'
    check (status in ('requested', 'sending', 'sent', 'refunded', 'failed', 'rejected')),
  provider_ref text,
  last_error text,
  note text check (note is null or char_length(note) <= 280),
  approved_by uuid references public.profiles (id),
  approved_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_order_idx on public.refunds (order_id);
create index refunds_status_idx on public.refunds (status, created_at desc);
-- One refund in progress per order, so an amount is never asked for twice.
create unique index refunds_one_open on public.refunds (order_id) where status in ('requested', 'sending', 'sent', 'failed');

alter table public.refunds enable row level security;
revoke all on table public.refunds from anon, authenticated;
grant select on public.refunds to authenticated;
create policy refunds_select_own on public.refunds for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = (select auth.uid())));
create policy refunds_select_ops on public.refunds for select to authenticated using ((select private.is_ops()));

-- ── What the buyer is owed for an order, less what is already settled or on its way ──
create function private.sync_refund_request(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owed numeric;
  settled numeric;
  due numeric;
  pay uuid;
  why text;
begin
  select coalesce(sum(round(oi.short_kg * oi.unit_price, 2)), 0),
         string_agg(oi.short_kg::text || ' ' || oi.unit || ' ' || p.name, ', ') filter (where oi.short_kg > 0)
    into owed, why
    from public.order_items oi join public.products p on p.id = oi.product_id
   where oi.order_id = p_order;
  select coalesce(sum(r.amount), 0) into settled from public.refunds r
   where r.order_id = p_order and r.status in ('sending', 'sent', 'refunded');
  due := owed - settled;

  if due <= 0 then
    delete from public.refunds where order_id = p_order and status = 'requested';
    return;
  end if;
  select p.id into pay from public.payments p where p.order_id = p_order and p.status = 'success' order by p.paid_at desc limit 1;

  update public.refunds set amount = due, reason = 'Not supplied: ' || why, updated_at = now()
   where order_id = p_order and status in ('requested', 'failed');
  if not found and not exists (select 1 from public.refunds r where r.order_id = p_order and r.status in ('sending', 'sent')) then
    insert into public.refunds (order_id, payment_id, amount, reason) values (p_order, pay, due, 'Not supplied: ' || why);
  end if;
end;
$$;
revoke all on function private.sync_refund_request(uuid) from public, anon, authenticated;

create function private.order_item_short_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_refund_request(new.order_id);
  return new;
end;
$$;
create trigger order_items_refund_request
after update of short_kg on public.order_items
for each row when (new.short_kg is distinct from old.short_kg)
execute function private.order_item_short_changed();

-- ── Ops approval. The edge function calls this with the approving user, then talks to Paystack. ──
-- Returns the row to refund through Paystack, or nothing when there is no Paystack payment (refund by hand).
create function public.claim_refund(p_id uuid, p_by uuid)
returns table (refund_id uuid, reference text, amount_pesewas bigint, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refunds;
  pay public.payments;
begin
  if not exists (select 1 from public.profiles where id = p_by and role = 'ops') then
    raise exception 'ops only';
  end if;
  select * into r from public.refunds where id = p_id for update;
  if not found or r.status not in ('requested', 'failed') then
    raise exception 'refund is not waiting for approval';
  end if;
  if r.payment_id is null then
    raise exception 'no online payment to refund';
  end if;
  select * into pay from public.payments where id = r.payment_id;
  if round(r.amount * 100) > pay.amount_pesewas then
    raise exception 'refund is more than was paid';
  end if;
  update public.refunds
     set status = 'sending', approved_by = p_by, approved_at = now(), last_error = null, updated_at = now()
   where id = p_id;
  return query select r.id, pay.reference, round(r.amount * 100)::bigint, r.reason;
end;
$$;
revoke all on function public.claim_refund(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_refund(uuid, uuid) to service_role;

-- Paystack's answer, from the edge function or the webhook. Safe to receive more than once.
create function public.apply_refund_result(p_id uuid, p_status text, p_provider_ref text, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refunds;
  ord public.orders;
begin
  if p_status not in ('sent', 'refunded', 'failed') then
    raise exception 'bad status';
  end if;
  select * into r from public.refunds where id = p_id for update;
  if not found or r.status in ('refunded', 'rejected') or r.status = p_status then
    return;
  end if;
  -- A late "accepted" must not undo a final answer.
  if p_status = 'sent' and r.status <> 'sending' then
    return;
  end if;
  update public.refunds
     set status = p_status,
         provider_ref = coalesce(p_provider_ref, provider_ref),
         last_error = case when p_status = 'failed' then left(coalesce(p_error, 'Paystack could not complete the refund.'), 300) else null end,
         refunded_at = case when p_status = 'refunded' then now() else refunded_at end,
         updated_at = now()
   where id = p_id;

  if p_status = 'refunded' then
    select * into ord from public.orders where id = r.order_id;
    insert into public.notifications (user_id, title, body)
    values (ord.buyer_id, 'Refund sent',
      format('GH₵ %s for order %s has been refunded to the account you paid with. It can take a few working days to show.', to_char(r.amount, 'FM999G999G990D00'), ord.code));
    update public.ops_decisions
       set status = 'resolved', resolution = 'Resolved automatically: the buyer was refunded.', resolved_at = now()
     where order_id = r.order_id and kind = 'short_supply' and status = 'open';
  end if;
end;
$$;
revoke all on function public.apply_refund_result(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_refund_result(uuid, text, text, text) to service_role;

-- ── Ops decisions that need no Paystack call ────────────────────────────────
-- Refunded outside Paystack (bank transfer orders, or settled by hand after a failure).
create function public.mark_refund_done(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  r public.refunds;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if v_note is null or char_length(v_note) > 280 then
    raise exception 'say how it was refunded';
  end if;
  select * into r from public.refunds where id = p_id for update;
  if not found or r.status not in ('requested', 'failed') then
    raise exception 'refund is not waiting for approval';
  end if;
  update public.refunds set status = 'sending', approved_by = uid, approved_at = now(), note = v_note, updated_at = now() where id = p_id;
  perform public.apply_refund_result(p_id, 'refunded', null, null);
end;
$$;

create function public.reject_refund(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not (select private.is_ops()) then
    raise exception 'ops only';
  end if;
  if v_note is null or char_length(v_note) > 280 then
    raise exception 'say why it is rejected';
  end if;
  update public.refunds set status = 'rejected', approved_by = uid, approved_at = now(), note = v_note, updated_at = now()
   where id = p_id and status in ('requested', 'failed');
  if not found then
    raise exception 'refund is not waiting for approval';
  end if;
end;
$$;
revoke all on function public.mark_refund_done(uuid, text), public.reject_refund(uuid, text) from public, anon;
grant execute on function public.mark_refund_done(uuid, text), public.reject_refund(uuid, text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'refunds') then
    alter publication supabase_realtime add table public.refunds;
  end if;
end $$;
