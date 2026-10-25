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
  /** What was bought, e.g. "Tomatoes A · 40 kg". */
  items: string[];
}

const fail = (msg: string) => (error: unknown) => {
  if (error) throw new Error(msg);
};

export async function fetchOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, code, amount, state, created_at, paid_at, buyer_id, buyers(organization_name, profiles(phone)), order_items(grade, kg, products(name))')
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
    items: (r.order_items ?? []).map((i: any) => `${i.products?.name ?? 'Item'} ${i.grade} · ${Number(i.kg).toLocaleString('en-GH')} kg`),
  }));
}

/** Cancels an unpaid order and releases its held stock. */
export async function cancelOrder(orderId: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId });
  if (!error) return;
  if (error.message.includes('not signed in')) throw new Error('Sign in again to continue.');
  if (error.message.includes('order cannot be cancelled')) throw new Error('This order can no longer be cancelled.');
  throw new Error('Could not cancel that order.');
}
