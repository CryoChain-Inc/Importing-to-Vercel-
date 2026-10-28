import { Linking, Platform } from 'react-native';
import type { AddressValue } from './maps.service';
import { requireUserId, supabase } from './supabase';

export type OrderState = 'awaiting_payment' | 'paid' | 'cancelled';

export interface OrderItem {
  name: string;
  grade: string;
  kg: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  code: string;
  amount: number;
  state: OrderState;
  createdAt: string;
  paidAt: string | null;
  items: OrderItem[];
  deliveryAddress: string;
  /** Farm pickups collected so far and the drop-off time; all zero/null until a driver is on the job. */
  progress: { pickupsTotal: number; pickupsDone: number; deliveredAt: string | null };
  /** Status of the latest Paystack attempt, if any; failed/abandoned means the buyer can retry. */
  payment: 'pending' | 'success' | 'failed' | 'abandoned' | 'mismatch' | 'orphaned' | null;
}

export interface TransferDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  supportPhone: string;
}

/** phone and email are read-only here: they change only through the verified flow in authService. */
export interface BuyerAddress extends AddressValue {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface BuyerDetails {
  organization: string;
  name: string;
  phone: string;
  email: string;
  /** The default address; empty until the buyer adds one. */
  location: string;
  addresses: BuyerAddress[];
}

const fail = (msg: string) => (error: unknown) => {
  if (error) throw new Error(msg);
};

const rpcError = (error: { message: string } | null, known: Record<string, string>, fallback: string) => {
  if (!error) return;
  const hit = Object.keys(known).find((k) => error.message.includes(k));
  throw new Error(hit ? known[hit] : fallback);
};

/** One shop row per product and grade that has a buyer price and stock. */
export interface CatalogueItem {
  productId: string;
  name: string;
  image: string | null;
  /** Extra gallery photos after the cover. */
  images: string[];
  description: string;
  categoryId: string;
  category: string;
  categoryImage: string | null;
  grade: 'A' | 'B' | 'C';
  price: number;
  availableKg: number;
}

export async function fetchCatalogue(): Promise<CatalogueItem[]> {
  const { data, error } = await supabase.rpc('buyer_catalogue');
  fail('Could not load the shop.')(error);
  return (data ?? []).map((r: any) => ({
    productId: r.product_id,
    name: r.product_name,
    image: r.product_image,
    images: r.product_images ?? [],
    description: r.product_description ?? '',
    categoryId: r.category_id,
    category: r.category_name,
    categoryImage: r.category_image,
    grade: r.grade,
    price: Number(r.price),
    availableKg: Number(r.available_kg),
  }));
}

export interface CartLine {
  productId: string;
  grade: CatalogueItem['grade'];
  kg: number;
}

export interface Shortfall {
  productId: string;
  grade: string;
  requestedKg: number;
  availableKg: number;
}

export type CheckoutResult = { ok: true; orderId: string } | { ok: false; shortfalls: Shortfall[] };

/** Checks every line against live supply and holds the kg for 30 minutes. Nothing is held unless the whole cart fits. */
export async function checkoutCart(lines: CartLine[], addressId: string): Promise<CheckoutResult> {
  const items = lines.map((l) => ({ product_id: l.productId, grade: l.grade, kg: l.kg }));
  const { data, error } = await supabase.rpc('checkout_cart', { p_items: items, p_address_id: addressId });
  rpcError(error, {
    'choose a delivery address': 'Choose a delivery address.',
    'pin your delivery address': 'Pin your delivery address on the map first (Account tab).',
    'not for sale': 'An item in your cart is no longer for sale. Remove it and try again.',
  }, 'Could not check out. Please try again.');
  if (!data.ok) {
    return { ok: false, shortfalls: data.shortfalls.map((r: any) => ({ productId: r.product_id, grade: r.grade, requestedKg: Number(r.requested_kg), availableKg: Number(r.available_kg) })) };
  }
  return { ok: true, orderId: data.order_id };
}

export async function fetchOrders(): Promise<Order[]> {
  const [{ data, error }, tracking] = await Promise.all([supabase
    .from('orders')
    .select('id, code, amount, state, created_at, paid_at, delivery_address, order_items(grade, kg, line_total, products(name)), payments(status, created_at)')
    .order('created_at', { ascending: false }), supabase.rpc('buyer_order_progress')]);
  fail('Could not load your orders.')(error);
  // Tracking is a nicety: if it cannot load, orders still show with their paid/unpaid state.
  const stops = new Map<string, any>((tracking.data ?? []).map((r: any) => [r.order_id, r]));
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    amount: Number(r.amount),
    state: r.state,
    createdAt: r.created_at,
    paidAt: r.paid_at,
    progress: {
      pickupsTotal: stops.get(r.id)?.pickups_total ?? 0,
      pickupsDone: stops.get(r.id)?.pickups_done ?? 0,
      deliveredAt: stops.get(r.id)?.delivered_at ?? null,
    },
    items: (r.order_items ?? []).map((i: any) => ({ name: i.products?.name ?? '', grade: i.grade, kg: Number(i.kg), lineTotal: Number(i.line_total) })),
    deliveryAddress: r.delivery_address ?? '',
    payment: [...(r.payments ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0]?.status ?? null,
  }));
}

/** Cancels an unpaid order; its held stock goes back on sale. */
export async function cancelOrder(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.rpc('cancel_order', { p_order_id: id });
  rpcError(error, {
    'not signed in': 'Sign in again to continue.',
    'order cannot be cancelled': 'This order can no longer be cancelled.',
    'Could not find the function': 'Cancelling orders is not available yet. Apply the latest database update, then try again.',
  }, 'Could not cancel that order.');
}

/** Asks Paystack for a checkout URL for an unpaid order (first try or retry). The order turns paid only via the webhook/verify. */
export async function startPayment(orderId: string): Promise<{ url: string; reference: string }> {
  const { data, error } = await supabase.functions.invoke('paystack-init', { body: { order_id: orderId } });
  if (error || !data?.url) {
    // Non-2xx responses hide the body inside error.context; surface our message when there is one.
    const body = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    throw new Error(body?.error ?? data?.error ?? 'Could not start the payment. Please try again.');
  }
  return { url: data.url, reference: data.reference };
}

export async function openPayment(url: string): Promise<void> {
  if (Platform.OS === 'web') window.location.assign(url);
  else await Linking.openURL(url);
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

export async function fetchBuyerDetails(): Promise<BuyerDetails> {
  const buyerId = await requireUserId();
  const { data, error } = await supabase
    .from('buyers')
    .select('organization_name, delivery_location, profiles(display_name, phone, email), buyer_addresses(id, label, address, line1, landmark, city, postcode, latitude, longitude, is_default, created_at)')
    .eq('id', buyerId)
    .single();
  fail('Could not load your account.')(error);
  const p = (data as { profiles?: { display_name?: string | null; phone?: string | null; email?: string | null } | { display_name?: string | null; phone?: string | null; email?: string | null }[] | null }).profiles;
  const profile = Array.isArray(p) ? p[0] : p;
  const rows: any[] = (data as any).buyer_addresses ?? [];
  const addresses = rows
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.created_at.localeCompare(b.created_at))
    .map((a): BuyerAddress => ({
      id: a.id,
      label: a.label,
      address: a.address,
      line1: a.line1 ?? '',
      landmark: a.landmark ?? '',
      city: a.city ?? '',
      postcode: a.postcode ?? '',
      latitude: a.latitude,
      longitude: a.longitude,
      isDefault: a.is_default,
    }));
  return {
    organization: data!.organization_name,
    name: profile?.display_name ?? '',
    phone: profile?.phone ?? '',
    email: profile?.email ?? '',
    location: data!.delivery_location,
    addresses,
  };
}

export async function saveBuyerDetails(b: Pick<BuyerDetails, 'organization' | 'name'>): Promise<void> {
  const { error } = await supabase.rpc('update_buyer_details', { p_organization: b.organization, p_name: b.name });
  fail('Could not save your details.')(error);
}

export const ADDRESS_MAX = 5;

/** id null adds a new address (the first one becomes the default). */
export async function saveAddress(id: string | null, label: string, a: AddressValue): Promise<void> {
  const { error } = await supabase.rpc('save_buyer_address', {
    p_id: id,
    p_label: label,
    p_address: a.address,
    p_line1: a.line1,
    p_landmark: a.landmark,
    p_city: a.city,
    p_postcode: a.postcode,
    p_latitude: a.latitude,
    p_longitude: a.longitude,
  });
  rpcError(error, { 'address limit': `You can keep up to ${ADDRESS_MAX} addresses.` }, 'Could not save that address.');
}

export async function setDefaultAddress(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_default_buyer_address', { p_id: id });
  fail('Could not change your default address.')(error);
}

export async function deleteAddress(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_buyer_address', { p_id: id });
  fail('Could not remove that address.')(error);
}

export type OrderStage = 'cancelled' | 'placed' | 'preparing' | 'on_the_way' | 'delivered';

/** Where an order stands: payment first, then (once paid) farm pickups and the drop-off. */
export function orderStage(o: Pick<Order, 'state' | 'progress'>): OrderStage {
  if (o.state === 'cancelled') return 'cancelled';
  if (o.state === 'awaiting_payment') return 'placed';
  if (o.progress.deliveredAt) return 'delivered';
  return o.progress.pickupsDone > 0 ? 'on_the_way' : 'preparing';
}

/** What the buyer sees: just the order, not who farmed or hauled it. */
export function orderStatus(o: Pick<Order, 'state' | 'progress'>): { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
  switch (orderStage(o)) {
    case 'cancelled': return { label: 'Cancelled', tone: 'neutral' };
    case 'placed': return { label: 'Awaiting payment', tone: 'warning' };
    case 'preparing': return { label: 'Preparing', tone: 'info' };
    case 'on_the_way': return { label: 'On the way', tone: 'info' };
    case 'delivered': return { label: 'Delivered', tone: 'success' };
  }
}
