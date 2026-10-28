import { pageRange, type Paged } from './paging';
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

const ORDER_COLS = 'id, code, amount, state, created_at, paid_at, buyer_id, buyers(organization_name, profiles(phone)), order_items(grade, kg, products(name))';

const toOrder = (r: any): OrderRow => ({
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
});

export async function fetchOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase.from('orders').select(ORDER_COLS).order('created_at', { ascending: false });
  fail('Could not load orders.')(error);
  return (data ?? []).map(toOrder);
}

/** One page of orders in a state, newest first, with the total in that state. */
export async function fetchOrdersPage(state: OrderRow['state'], page: number): Promise<Paged<OrderRow>> {
  const [from, to] = pageRange(page);
  const { data, error, count } = await supabase.from('orders').select(ORDER_COLS, { count: 'exact' })
    .eq('state', state).order('created_at', { ascending: false }).range(from, to);
  fail('Could not load orders.')(error);
  return { rows: (data ?? []).map(toOrder), total: count ?? 0 };
}

export async function fetchOrdersFor(buyerIds: string[]): Promise<OrderRow[]> {
  if (!buyerIds.length) return [];
  const { data, error } = await supabase.from('orders').select(ORDER_COLS).in('buyer_id', buyerIds).order('created_at', { ascending: false });
  fail('Could not load orders.')(error);
  return (data ?? []).map(toOrder);
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
