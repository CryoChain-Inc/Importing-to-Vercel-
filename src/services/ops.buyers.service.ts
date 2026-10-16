import { requireUserId, supabase } from './supabase';

export interface OrderRow {
  id: string;
  code: string;
  amount: number;
  state: 'awaiting_payment' | 'paid' | 'cancelled';
  createdAt: string;
  paidAt: string | null;
  buyer: string;
  buyerPhone: string;
  lotCode: string;
  product: string;
  totalKg: number;
}

export interface RequirementRow {
  id: string;
  buyer: string;
  buyerPhone: string;
  product: string;
  grade: string;
  quantityKg: number;
  period: string;
  maxPricePerKg: number;
  destination: string;
  state: 'open' | 'matched' | 'closed';
  createdAt: string;
}

const fail = (msg: string) => (error: unknown) => {
  if (error) throw new Error(msg);
};

export async function fetchOrders(): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, code, amount, state, created_at, paid_at, buyers(organization_name, profiles(phone)), lots(code, product, total_kg)')
    .order('created_at', { ascending: false });
  fail('Could not load orders.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    amount: Number(r.amount),
    state: r.state,
    createdAt: r.created_at,
    paidAt: r.paid_at,
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

export async function fetchRequirements(): Promise<RequirementRow[]> {
  const { data, error } = await supabase
    .from('requirements')
    .select('id, product, grade, quantity_kg, period, max_price_per_kg, destination, state, created_at, buyers(organization_name, profiles(phone))')
    .order('created_at', { ascending: false });
  fail('Could not load requirements.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    buyer: r.buyers?.organization_name ?? 'Unknown buyer',
    buyerPhone: r.buyers?.profiles?.phone ?? '',
    product: r.product,
    grade: r.grade,
    quantityKg: Number(r.quantity_kg),
    period: r.period,
    maxPricePerKg: Number(r.max_price_per_kg),
    destination: r.destination,
    state: r.state,
    createdAt: r.created_at,
  }));
}

export async function closeRequirement(id: string): Promise<void> {
  const { error } = await supabase.from('requirements').update({ state: 'closed' }).eq('id', id);
  fail('Could not close that requirement.')(error);
}
