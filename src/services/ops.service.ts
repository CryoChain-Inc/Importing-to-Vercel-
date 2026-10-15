import { normalizePhone } from '../utils/format';
import { replaceImage, type PickedImage } from './catalogueImage';
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
  pointId: string | null;
  lotId: string | null;
  createdAt: string;
}

export interface LotRow {
  id: string;
  code: string;
  product: string;
  totalKg: number;
  pricePerKg: number | null;
  state: string;
  listings: number;
  createdAt: string;
}

export const LOT_MAX_KG = 3000;
export const LOT_MIN_KG = 2700;
export const STOP_MIN_VALUE_GHS = 6200;

export interface Category {
  id: string;
  name: string;
  imagePath: string | null;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  category: string;
  imagePath: string | null;
  active: boolean;
}

export interface PriceRow {
  productId: string;
  grade: 'A' | 'B' | 'C';
  price: number;
  prevPrice: number | null;
}

export interface PointRow {
  id: string;
  name: string;
  locality: string;
  address: string;
  active: boolean;
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
    .select('id, product, weight_kg, created_at, lot_id, collection_point_id, farmers(locality, profiles(display_name)), collection_points(name)')
    .order('created_at', { ascending: false });
  fail('Could not load supply.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    product: r.product,
    weightKg: Number(r.weight_kg),
    farmer: r.farmers?.profiles?.display_name ?? 'Unnamed farmer',
    locality: r.farmers?.locality ?? '',
    point: r.collection_points?.name ?? '—',
    pointId: r.collection_point_id,
    lotId: r.lot_id,
    createdAt: r.created_at,
  }));
}

export async function fetchCatalogue(): Promise<{ categories: Category[]; products: Product[]; prices: PriceRow[] }> {
  const [k, p, c] = await Promise.all([
    supabase.from('categories').select('id, name, image_path, active').order('name'),
    supabase.from('products').select('id, name, category_id, image_path, active, categories(name)').order('name'),
    supabase.from('crop_prices').select('product_id, grade, price, prev_price'),
  ]);
  fail('Could not load prices.')(k.error ?? p.error ?? c.error);
  return {
    categories: (k.data ?? []).map((r) => ({ id: r.id, name: r.name, imagePath: r.image_path, active: r.active })),
    products: (p.data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      categoryId: r.category_id,
      category: r.categories?.name ?? '',
      imagePath: r.image_path,
      active: r.active,
    })),
    prices: (c.data ?? []).map((r) => ({
      productId: r.product_id,
      grade: r.grade,
      price: Number(r.price),
      prevPrice: r.prev_price == null ? null : Number(r.prev_price),
    })),
  };
}

/** Insert or update a category/product, then swap its image if a new one was picked. */
async function saveWithImage(
  table: 'categories' | 'products',
  id: string | undefined,
  fields: Record<string, unknown>,
  image: PickedImage | undefined,
  oldPath: string | null | undefined,
  failMsg: string,
) {
  let rowId = id;
  if (rowId) {
    fail(failMsg)((await supabase.from(table).update(fields).eq('id', rowId)).error);
  } else {
    const { data, error } = await supabase.from(table).insert(fields).select('id').single();
    fail(failMsg)(error);
    rowId = data!.id as string;
  }
  if (image) {
    const path = await replaceImage(table, rowId, image, oldPath);
    fail('Saved, but could not attach the image.')((await supabase.from(table).update({ image_path: path }).eq('id', rowId)).error);
  }
}

export interface CategoryInput { id?: string; name: string; active: boolean; image?: PickedImage; oldImagePath?: string | null }
export interface ProductInput extends CategoryInput { categoryId: string }

export const saveCategory = (c: CategoryInput) =>
  saveWithImage('categories', c.id, { name: c.name.trim(), active: c.active }, c.image, c.oldImagePath,
    'Could not save that category (is the name already used?).');

export const saveProduct = (p: ProductInput) =>
  saveWithImage('products', p.id, { name: p.name.trim(), category_id: p.categoryId, active: p.active }, p.image, p.oldImagePath,
    'Could not save that product (is the name already used?).');

/** prev_price is set by a database trigger when the price changes. */
export async function setPrice(productId: string, grade: string, price: number): Promise<void> {
  const { error } = await supabase
    .from('crop_prices')
    .upsert({ product_id: productId, grade, price }, { onConflict: 'product_id,grade' });
  fail('Could not save the price.')(error);
}

export async function deletePrice(productId: string, grade: string): Promise<void> {
  const { error } = await supabase.from('crop_prices').delete().eq('product_id', productId).eq('grade', grade);
  fail('Could not remove the price.')(error);
}

export async function fetchPoints(): Promise<PointRow[]> {
  const { data, error } = await supabase
    .from('collection_points')
    .select('id, name, locality, address, active')
    .order('created_at', { ascending: false });
  fail('Could not load collection points.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    locality: r.locality ?? '',
    address: r.address ?? '',
    active: r.active,
  }));
}

export interface NewPoint {
  name: string;
  locality: string;
  address: string;
}

const pointFields = (p: NewPoint) => ({
  name: p.name.trim(),
  locality: p.locality.trim() || null,
  address: p.address.trim() || null,
});

export async function createPoint(p: NewPoint): Promise<void> {
  const { error } = await supabase.from('collection_points').insert(pointFields(p));
  fail('Could not create the collection point.')(error);
}

export async function updatePoint(id: string, p: NewPoint): Promise<void> {
  const { error } = await supabase.from('collection_points').update(pointFields(p)).eq('id', id);
  fail('Could not update the collection point.')(error);
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

export type StaffRole = 'agent' | 'driver' | 'ops';

export interface TeamMember {
  id: string;
  name: string;
  role: StaffRole;
  phone: string;
  email: string;
  detail: string;
  joinedAt: string;
}

export async function fetchTeam(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, display_name, phone, email, created_at, agents(coverage_area), drivers(vehicle_type, plate_number)')
    .in('role', ['agent', 'driver', 'ops'])
    .order('created_at', { ascending: false });
  fail('Could not load the team.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.display_name ?? 'Unnamed',
    role: r.role,
    phone: r.phone ?? '',
    email: r.email ?? '',
    detail: r.agents?.coverage_area ?? [r.drivers?.vehicle_type, r.drivers?.plate_number].filter(Boolean).join(' · '),
    joinedAt: r.created_at,
  }));
}

/** The edge function creates the auth user + profile with the service role and re-checks that the caller is ops. */
export async function inviteStaff(i: { name: string; phone: string; email: string; role: StaffRole }): Promise<void> {
  const { error } = await supabase.functions.invoke('invite-staff', { body: i });
  if (!error) return;
  const res = (error as { context?: Response }).context;
  const msg = res ? (await res.json().catch(() => null))?.error : null;
  throw new Error(msg ?? 'Could not send the invite.');
}

export async function fetchLots(): Promise<LotRow[]> {
  const { data, error } = await supabase
    .from('lots')
    .select('id, code, product, total_kg, price_per_kg, state, created_at, produce_listings(count)')
    .order('created_at', { ascending: false });
  fail('Could not load lots.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    product: r.product,
    totalKg: Number(r.total_kg),
    pricePerKg: r.price_per_kg == null ? null : Number(r.price_per_kg),
    state: r.state,
    listings: r.produce_listings?.[0]?.count ?? 0,
    createdAt: r.created_at,
  }));
}

/** Atomic: the database locks the listings and re-checks one product, unallocated, and the 3,000 kg cap. */
export async function createLot(listingIds: string[], pricePerKg: number, requirementId?: string): Promise<void> {
  const { error } = await supabase.rpc('create_lot', { p_listing_ids: listingIds, p_price_per_kg: pricePerKg, p_requirement_id: requirementId ?? null });
  if (error) {
    throw new Error(/already in a lot/.test(error.message) ? 'Some of those listings were just allocated. Refresh and try again.' : 'Could not create the lot.');
  }
}

export async function cancelLot(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_lot', { p_lot_id: id });
  fail('Could not cancel that lot.')(error);
}

export interface AssignedRoute {
  id: string;
  agentId: string;
  agentName: string;
  driverName: string;
  destination: string;
  stops: { pointName: string; locality: string; product: string }[];
}

/** Today's routes, one per agent, as ops assigned them. */
export async function fetchRoutes(): Promise<AssignedRoute[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('id, agent_id, destination, profiles!routes_agent_id_fkey(display_name), driver:profiles!routes_driver_id_fkey(display_name), route_stops(product, collection_points(name, locality))')
    .eq('service_date', accraToday());
  fail('Could not load routes.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    agentId: r.agent_id,
    agentName: r.profiles?.display_name ?? 'Agent',
    driverName: r.driver?.display_name ?? '',
    destination: r.destination ?? '',
    stops: (r.route_stops ?? [])
      .map((s: any) => ({
        pointName: s.collection_points?.name ?? 'Collection point',
        locality: s.collection_points?.locality ?? '',
        product: s.product,
      }))
      .sort((a: { pointName: string }, b: { pointName: string }) => a.pointName.localeCompare(b.pointName)),
  }));
}

/** Replaces that agent's stops for today. */
export async function assignRoute(
  agentId: string,
  stops: { pointId: string; product: string }[],
  driverId: string,
  destination: string,
): Promise<void> {
  const { error } = await supabase.rpc('assign_route', {
    p_agent_id: agentId,
    p_stops: stops.map((s) => ({ collection_point_id: s.pointId, product: s.product })),
    p_driver_id: driverId,
    p_destination: destination.trim(),
  });
  if (!error) return;
  const msg = error.message ?? '';
  if (/choose an agent/.test(msg)) throw new Error('Choose a field agent.');
  if (/choose a driver/.test(msg)) throw new Error('Choose a driver.');
  if (/enter a destination/.test(msg)) throw new Error('Enter where this load will be delivered.');
  if (/driver already assigned/.test(msg)) throw new Error('That driver already has a route today.');
  if (/at least one stop/.test(msg)) throw new Error('Choose at least one collection point.');
  if (/ops only/.test(msg)) throw new Error('Only operations can assign a route.');
  throw new Error('Could not assign that route.');
}
