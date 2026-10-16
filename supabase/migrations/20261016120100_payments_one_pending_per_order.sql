-- Idempotent checkout: an order has at most one live (pending) Paystack attempt. Starting payment again
-- reuses that attempt's checkout URL instead of creating a second chargeable one.

alter table public.payments add column authorization_url text;

-- Collapse any existing duplicates (keep the newest pending attempt per order) so the index can be built.
update public.payments p set status = 'abandoned'
 where status = 'pending'
   and exists (select 1 from public.payments n
                where n.order_id = p.order_id and n.status = 'pending'
                  and (n.created_at, n.id) > (p.created_at, p.id));

create unique index payments_one_pending_per_order on public.payments (order_id) where status = 'pending';
