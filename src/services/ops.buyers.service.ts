import { requireUserId, supabase } from './supabase';

export interface OrderRow {
  id: string;
  code: string;
  amount: number;
  state: 'awaiting_payment' | 'paid' | 'cancelled';
  createdAt: string;
  paidAt: string | null;
  buyerId: string;
  buyer: string;
  buyerPhone: string;
  lotCode: string;
  product: string;
  totalKg: number;
}

const fail = (msg: string) => (error: unknown) => {
  if (error) throw new Error(msg);
};

export async function fetchOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, code, amount, state, created_at, paid_at, buyer_id, buyers(organization_name, profiles(phone)), lots(code, product, total_kg)')
    .order('created_at', { ascending: false });
  fail('Could not load orders.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    amount: Number(r.amount),
    state: r.state,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    buyerId: r.buyer_id,
    buyer: r.buyers?.organization_name ?? 'Unknown buyer',
    buyerPhone: r.buyers?.profiles?.phone ?? '',
    lotCode: r.lots?.code ?? '',
    product: r.lots?.product ?? '',
    totalKg: Number(r.lots?.total_kg ?? 0),
  }));
}

/** Call only after the transfer has landed in the bank account; this funds escrow for the lot. */
export async function confirmPayment(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_order_payment', { p_order_id: orderId });
  fail('Could not confirm that payment (was it already confirmed or cancelled?).')(error);
}

/** Releases the lot back to sale. */
export async function cancelOrder(orderId: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId });
  if (!error) return;
  if (error.message.includes('not signed in')) throw new Error('Sign in again to continue.');
  if (error.message.includes('order cannot be cancelled')) throw new Error('This order can no longer be cancelled.');
  throw new Error('Could not cancel that order.');
}
