import { Linking, Platform } from 'react-native';
import { supabase } from './supabase';

export interface TodayLot {
  id: string;
  code: string;
  product: string;
  totalKg: number;
  pricePerKg: number;
  amount: number;
}

export type OrderState = 'awaiting_payment' | 'paid' | 'cancelled';

export interface Order {
  id: string;
  code: string;
  amount: number;
  state: OrderState;
  createdAt: string;
  lotCode: string;
  product: string;
  totalKg: number;
  lotState: string;
  /** Status of the latest Paystack attempt, if any; failed/abandoned means the buyer can retry. */
  payment: 'pending' | 'success' | 'failed' | 'abandoned' | 'mismatch' | 'orphaned' | null;
}

export interface TransferDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  supportPhone: string;
}

export type Period = 'once' | 'daily' | 'weekly';

export interface Requirement {
  id: string;
  product: string;
  grade: 'A' | 'B';
  quantityKg: number;
  period: Period;
  maxPricePerKg: number;
  destination: string;
  state: 'open' | 'matched' | 'closed';
  createdAt: string;
}

export type NewRequirement = Omit<Requirement, 'id' | 'state' | 'createdAt'>;

/** phone and email are read-only here: they change only through the verified flow in authService. */
export interface BuyerDetails {
  organization: string;
  name: string;
  phone: string;
  email: string;
  location: string;
}

const fail = (msg: string) => (error: unknown) => {
  if (error) throw new Error(msg);
};

const rpcError = (error: { message: string } | null, known: Record<string, string>, fallback: string) => {
  if (!error) return;
  const hit = Object.keys(known).find((k) => error.message.includes(k));
  throw new Error(hit ? known[hit] : fallback);
};

/** Lot "days" follow Ghana time, matching lots.sale_date. */
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });

/** RLS also exposes a buyer's own ordered lots, so filter to what is still on sale today. */
export async function fetchTodayLots(): Promise<TodayLot[]> {
  const { data, error } = await supabase
    .from('lots')
    .select('id, code, product, total_kg, price_per_kg')
    .eq('state', 'listed')
    .eq('sale_date', today())
    .not('price_per_kg', 'is', null)
    .order('created_at', { ascending: false });
  fail('Could not load today\'s lots.')(error);
  return (data ?? []).map((r) => {
    const totalKg = Number(r.total_kg);
    const pricePerKg = Number(r.price_per_kg);
    return { id: r.id, code: r.code, product: r.product, totalKg, pricePerKg, amount: Math.round(totalKg * pricePerKg * 100) / 100 };
  });
}

/** Atomic: reserves the lot and snapshots the amount, so two buyers can't take the same lot. */
export async function placeOrder(lotId: string): Promise<string> {
  const { data, error } = await supabase.rpc('place_order', { p_lot_id: lotId });
  rpcError(error, { 'no longer available': 'Someone just took that lot. Pick another.' }, 'Could not place the order.');
  return data as string;
}

export async function fetchOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, code, amount, state, created_at, lots(code, product, total_kg, state), payments(status, created_at)')
    .order('created_at', { ascending: false });
  fail('Could not load your orders.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    amount: Number(r.amount),
    state: r.state,
    createdAt: r.created_at,
    lotCode: r.lots?.code ?? '',
    product: r.lots?.product ?? '',
    totalKg: Number(r.lots?.total_kg ?? 0),
    lotState: r.lots?.state ?? '',
    payment: [...(r.payments ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0]?.status ?? null,
  }));
}

export async function cancelOrder(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_order', { p_order_id: id });
  fail('Could not cancel that order.')(error);
}

/** Opens Paystack checkout for an unpaid order (first try or retry). The order turns paid only via the webhook/verify. */
export async function payOnline(orderId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('paystack-init', { body: { order_id: orderId } });
  if (error || !data?.url) {
    // Non-2xx responses hide the body inside error.context; surface our message when there is one.
    const body = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    throw new Error(body?.error ?? data?.error ?? 'Could not start the payment. Please try again.');
  }
  if (Platform.OS === 'web') window.location.assign(data.url);
  else await Linking.openURL(data.url);
}

/** Returning from Paystack: pull the reference out of the callback URL and confirm it server-side. */
export function paymentReference(url: string | null): string | null {
  const m = url?.match(/[?&](?:reference|trxref)=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function verifyPayment(reference: string): Promise<void> {
  await supabase.functions.invoke('paystack-verify', { body: { reference } });
}

/** Ops bank account for transfers; only buyers can call it (ops_config is ops-only). */
export async function fetchTransferDetails(): Promise<TransferDetails | null> {
  const { data, error } = await supabase.rpc('get_transfer_details');
  fail('Could not load the payment details.')(error);
  const r = data?.[0];
  if (!r?.account_number) return null;
  return { bankName: r.bank_name ?? '', accountName: r.account_name ?? '', accountNumber: r.account_number, supportPhone: r.support_phone ?? '' };
}

export async function fetchProductNames(): Promise<string[]> {
  const { data, error } = await supabase.from('products').select('name').eq('active', true).order('name');
  fail('Could not load products.')(error);
  return (data ?? []).map((p) => p.name);
}

export async function fetchRequirements(): Promise<Requirement[]> {
  const { data, error } = await supabase
    .from('requirements')
    .select('id, product, grade, quantity_kg, period, max_price_per_kg, destination, state, created_at')
    .order('created_at', { ascending: false });
  fail('Could not load your requirements.')(error);
  return (data ?? []).map((r) => ({
    id: r.id,
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

export async function createRequirement(r: NewRequirement): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in again to continue.');
  const { error } = await supabase.from('requirements').insert({
    buyer_id: user.id,
    product: r.product,
    grade: r.grade,
    quantity_kg: r.quantityKg,
    period: r.period,
    max_price_per_kg: r.maxPricePerKg,
    destination: r.destination.trim(),
  });
  fail('Could not post the requirement.')(error);
}

export async function closeRequirement(id: string): Promise<void> {
  const { error } = await supabase.from('requirements').update({ state: 'closed' }).eq('id', id);
  fail('Could not close that requirement.')(error);
}

export async function fetchBuyerDetails(): Promise<BuyerDetails> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in again to continue.');
  const { data, error } = await supabase
    .from('buyers')
    .select('organization_name, delivery_location, profiles(display_name, phone, email)')
    .eq('id', user.id)
    .single();
  fail('Could not load your account.')(error);
  const p = (data as any).profiles;
  return {
    organization: data!.organization_name,
    name: p?.display_name ?? '',
    phone: p?.phone ?? '',
    email: p?.email ?? '',
    location: data!.delivery_location,
  };
}

export async function saveBuyerDetails(b: Pick<BuyerDetails, 'organization' | 'name' | 'location'>): Promise<void> {
  const { error } = await supabase.rpc('update_buyer_details', {
    p_organization: b.organization,
    p_name: b.name,
    p_location: b.location,
  });
  fail('Could not save your details.')(error);
}

/** Status shown to the buyer: payment first, then the lot's journey once it is funded. */
export function orderStatus(o: Pick<Order, 'state' | 'lotState'>): { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
  if (o.state === 'cancelled') return { label: 'Cancelled', tone: 'neutral' };
  if (o.state === 'awaiting_payment') return { label: 'Awaiting payment', tone: 'warning' };
  const journey: Record<string, string> = {
    escrow_funded: 'Payment confirmed',
    collecting: 'Collecting from farms',
    in_transit: 'In transit',
    delivered: 'Delivered',
    accepted: 'Accepted',
    disputed: 'In dispute',
  };
  return { label: journey[o.lotState] ?? 'Paid', tone: o.lotState === 'disputed' ? 'danger' : 'success' };
}
