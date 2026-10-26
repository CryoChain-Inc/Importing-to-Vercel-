-- A buyer (or ops) can cancel an unpaid order. The lot goes back on today's board
-- so any buyer can purchase it. A pending Paystack attempt is abandoned; if the
-- money still arrives, settle_paystack_payment marks that payment orphaned.

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

  select * into lot from public.lots where id = ord.lot_id for update;
  -- Paid or already moving lots stay as they are. A reserved lot is the normal case.
  if not found or lot.state not in ('escrow_pending', 'listed') then
    raise exception 'order cannot be cancelled';
  end if;

  update public.orders set state = 'cancelled' where id = ord.id;

  update public.payments
     set status = 'abandoned', gateway_response = 'order cancelled'
   where order_id = ord.id and status = 'pending';

  -- sale_date must be today (Accra) or the marketplace query hides the lot.
  if lot.state = 'escrow_pending' then
    update public.lots
       set state = 'listed',
           sale_date = (now() at time zone 'Africa/Accra')::date
     where id = lot.id;
  end if;
end;
$$;

revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;
