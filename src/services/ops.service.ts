import { normalizePhone } from '../utils/format';
import { supabase } from './supabase';

export interface FarmerRow {
  id: string;
  name: string;
  phone: string;
  locality: string;
  address: string;
  walletReady: boolean;
  walletVerified: boolean;
  joinedAt: string;
}

export interface SupplyRow {
  id: string;
  product: string;
  weightKg: number;
  farmer: string;
  locality: string;
  point: string;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  active: boolean;
}

export interface PriceRow {
  productId: string;
  grade: 'A' | 'B' | 'C';
  price: number;
  prevPrice: number | null;
  window: string;
}

export interface PointRow {
  id: string;
  name: string;
  locality: string;
  address: string;
  days: number[];
  start: string;
  end: string;
  active: boolean;
  productIds: string[];
}

export interface OpsConfig {
  minTemp: string;
  maxTemp: string;
  payoutThreshold: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  supportPhone: string;
}

const fail = (msg: string) => (error: unknown) => {
  if (error) throw new Error(msg);
};

export async function fetchFarmers(): Promise<FarmerRow[]> {
  const { data, error } = await supabase
    .from('farmers')
    .select('id, address, locality, momo_number, wallet_verified_at, created_at, profiles(display_name, phone)')
    .order('created_at', { ascending: false });
  fail('Could not load farmers.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.profiles?.display_name ?? 'Unnamed farmer',
    phone: r.profiles?.phone ?? '',
    locality: r.locality ?? '',
    address: r.address ?? '',
    walletReady: Boolean(r.momo_number),
    walletVerified: Boolean(r.wallet_verified_at),
    joinedAt: r.created_at,
  }));
}

export async function fetchSupply(): Promise<SupplyRow[]> {
  const { data, error } = await supabase
    .from('produce_listings')
    .select('id, product, weight_kg, created_at, farmers(locality, profiles(display_name)), collection_points(name)')
    .order('created_at', { ascending: false });
  fail('Could not load supply.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    product: r.product,
    weightKg: Number(r.weight_kg),
    farmer: r.farmers?.profiles?.display_name ?? 'Unnamed farmer',
    locality: r.farmers?.locality ?? '',
    point: r.collection_points?.name ?? '—',
    createdAt: r.created_at,
  }));
}

export async function fetchCatalogue(): Promise<{ products: Product[]; prices: PriceRow[] }> {
  const [p, c] = await Promise.all([
    supabase.from('products').select('id, name, category, active').order('name'),
    supabase.from('crop_prices').select('product_id, grade, price, prev_price, window_label'),
  ]);
  fail('Could not load prices.')(p.error ?? c.error);
  return {
    products: p.data ?? [],
    prices: (c.data ?? []).map((r) => ({
      productId: r.product_id,
      grade: r.grade,
      price: Number(r.price),
      prevPrice: r.prev_price == null ? null : Number(r.prev_price),
      window: r.window_label ?? '',
    })),
  };
}

export async function addProduct(name: string, category: string): Promise<void> {
  const { error } = await supabase.from('products').insert({ name: name.trim(), category: category.trim() });
  fail('Could not add that product (is the name already used?).')(error);
}

/** prev_price is set by a database trigger when the price changes. */
export async function setPrice(productId: string, grade: string, price: number, window: string): Promise<void> {
  const { error } = await supabase
    .from('crop_prices')
    .upsert({ product_id: productId, grade, price, window_label: window.trim() || null }, { onConflict: 'product_id,grade' });
  fail('Could not save the price.')(error);
}

export async function fetchPoints(): Promise<PointRow[]> {
  const { data, error } = await supabase
    .from('collection_points')
    .select('id, name, locality, address, days, window_start, window_end, active, collection_point_products(product_id)')
    .order('created_at', { ascending: false });
  fail('Could not load collection points.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    locality: r.locality ?? '',
    address: r.address ?? '',
    days: r.days,
    start: r.window_start,
    end: r.window_end,
    active: r.active,
    productIds: r.collection_point_products.map((x: any) => x.product_id),
  }));
}

export interface NewPoint {
  name: string;
  locality: string;
  address: string;
  days: number[];
  start: string;
  end: string;
  productIds: string[];
}

export async function createPoint(p: NewPoint): Promise<void> {
  const { data, error } = await supabase
    .from('collection_points')
    .insert({
      name: p.name.trim(),
      locality: p.locality.trim() || null,
      address: p.address.trim() || null,
      days: p.days,
      window_start: p.start,
      window_end: p.end,
    })
    .select('id')
    .single();
  fail('Could not create the collection point (check the time window).')(error);
  const { error: e2 } = await supabase
    .from('collection_point_products')
    .insert(p.productIds.map((product_id) => ({ collection_point_id: data!.id, product_id })));
  fail('Point created, but its products could not be saved.')(e2);
}

export async function setPointActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('collection_points').update({ active }).eq('id', id);
  fail('Could not update the collection point.')(error);
}

export async function fetchConfig(): Promise<OpsConfig> {
  const { data, error } = await supabase.from('ops_config').select('*').single();
  fail('Could not load settings.')(error);
  const s = (v: unknown) => (v == null ? '' : String(v));
  return {
    minTemp: s(data!.min_temp_c),
    maxTemp: s(data!.max_temp_c),
    payoutThreshold: s(data!.payout_threshold_ghs),
    bankName: s(data!.transfer_bank_name),
    accountName: s(data!.transfer_account_name),
    accountNumber: s(data!.transfer_account_number),
    supportPhone: s(data!.support_phone),
  };
}

export async function saveConfig(c: OpsConfig): Promise<void> {
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const txt = (v: string) => v.trim() || null;
  const { error } = await supabase
    .from('ops_config')
    .update({
      min_temp_c: num(c.minTemp),
      max_temp_c: num(c.maxTemp),
      payout_threshold_ghs: num(c.payoutThreshold),
      transfer_bank_name: txt(c.bankName),
      transfer_account_name: txt(c.accountName),
      transfer_account_number: txt(c.accountNumber),
      support_phone: c.supportPhone.trim() ? normalizePhone(c.supportPhone) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', true);
  fail('Could not save settings (min temp must be below max; account number is digits only).')(error);
}
