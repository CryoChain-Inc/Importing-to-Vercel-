import { normalizePhone } from '../utils/format';
import { likeTerm, pageRange, type Paged } from './paging';
import { removeStoredImage, replaceImage, type PickedImage } from './catalogueImage';
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
  /** Still unsold after buyers' payments and declined offers. */
  remainingKg: number;
  farmer: string;
  farmerId: string;
  locality: string;
  point: string;
  pointId: string | null;
  /** Storage paths of the farmer's photos in the produce bucket. */
  imagePaths: string[];
  /** Grade the farmer declared. */
  grade: 'A' | 'B' | 'C';
  createdAt: string;
}

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
  /** Extra gallery photos shown on the buyer's product page, after the cover. */
  imagePaths: string[];
  description: string;
  active: boolean;
}

export type PriceKind = 'farmer' | 'buyer';
const PRICE_TABLE: Record<PriceKind, 'crop_prices' | 'buyer_prices'> = { farmer: 'crop_prices', buyer: 'buyer_prices' };

export interface PriceRow {
  kind: PriceKind;
  productId: string;
  grade: 'A' | 'B' | 'C';
  price: number;
  prevPrice: number | null;
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

const FARMER_COLS = 'id, address, locality, momo_number, wallet_verified_at, created_at, profiles!inner(display_name, phone)';

const toFarmer = (r: any): FarmerRow => ({
  id: r.id,
  name: r.profiles?.display_name ?? 'Unnamed farmer',
  phone: r.profiles?.phone ?? '',
  locality: r.locality ?? '',
  address: r.address ?? '',
  walletReady: Boolean(r.momo_number),
  walletVerified: Boolean(r.wallet_verified_at),
  joinedAt: r.created_at,
});

export async function fetchFarmers(): Promise<FarmerRow[]> {
  const { data, error } = await supabase.from('farmers').select(FARMER_COLS).order('created_at', { ascending: false });
  fail('Could not load farmers.')(error);
  return (data ?? []).map(toFarmer);
}

export interface FarmerListing { id: string; product: string; grade: 'A' | 'B' | 'C'; weightKg: number }

/** One page of farmers (newest first, optionally matching a search) with everything each has listed. */
export async function fetchFarmersPage(page: number, q: string): Promise<Paged<FarmerRow & { listings: FarmerListing[] }>> {
  const [from, to] = pageRange(page);
  let query = supabase.from('farmers').select(FARMER_COLS, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
  if (q.trim()) {
    const p = likeTerm(q);
    query = query.or(`locality.ilike.${p},profiles.display_name.ilike.${p},profiles.phone.ilike.${p}`);
  }
  const { data, error, count } = await query;
  fail('Could not load farmers.')(error);
  const farmers = (data ?? []).map(toFarmer);
  const ids = farmers.map((f) => f.id);
  const listed = ids.length ? await supabase.from('produce_listings').select('id, product, grade, weight_kg, farmer_id').in('farmer_id', ids).order('created_at', { ascending: false }) : null;
  fail('Could not load farmers.')(listed?.error);
  return {
    rows: farmers.map((f) => ({
      ...f,
      listings: (listed?.data ?? []).filter((l: any) => l.farmer_id === f.id).map((l: any) => ({ id: l.id, product: l.product, grade: l.grade ?? 'A', weightKg: Number(l.weight_kg) })),
    })),
    total: count ?? 0,
  };
}

const SUPPLY_COLS = 'id, product, grade, weight_kg, image_paths, created_at, farmer_id, collection_point_id, farmers(locality, profiles(display_name)), collection_points(name)';

const toSupply = (r: any, left: Map<string, number>): SupplyRow => ({
  id: r.id,
  product: r.product,
  weightKg: Number(r.weight_kg),
  remainingKg: left.get(r.id) ?? Number(r.weight_kg),
  farmer: r.farmers?.profiles?.display_name ?? 'Unnamed farmer',
  farmerId: r.farmer_id,
  locality: r.farmers?.locality ?? '',
  point: r.collection_points?.name ?? '—',
  pointId: r.collection_point_id,
  imagePaths: r.image_paths ?? [],
  grade: r.grade ?? 'A',
  createdAt: r.created_at,
});

export async function fetchSupply(): Promise<SupplyRow[]> {
  const [{ data, error }, stock] = await Promise.all([
    supabase.from('produce_listings').select(SUPPLY_COLS).order('created_at', { ascending: false }),
    supabase.from('listing_stock').select('listing_id, remaining_kg'),
  ]);
  fail('Could not load supply.')(error ?? stock.error);
  const left = new Map((stock.data ?? []).map((r) => [r.listing_id as string, Number(r.remaining_kg)]));
  return (data ?? []).map((r) => toSupply(r, left));
}

/** One page of farmers' listings, newest first. */
export async function fetchSupplyPage(page: number): Promise<Paged<SupplyRow>> {
  const [from, to] = pageRange(page);
  const { data, error, count } = await supabase.from('produce_listings').select(SUPPLY_COLS, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
  fail('Could not load supply.')(error);
  const ids = (data ?? []).map((r: any) => r.id as string);
  const stock = ids.length ? await supabase.from('listing_stock').select('listing_id, remaining_kg').in('listing_id', ids) : null;
  fail('Could not load supply.')(stock?.error);
  const left = new Map((stock?.data ?? []).map((r) => [r.listing_id as string, Number(r.remaining_kg)]));
  return { rows: (data ?? []).map((r) => toSupply(r, left)), total: count ?? 0 };
}

export async function fetchCatalogue(): Promise<{ categories: Category[]; products: Product[]; prices: PriceRow[] }> {
  const [k, p, c, b] = await Promise.all([
    supabase.from('categories').select('id, name, image_path, active').order('name'),
    supabase.from('products').select('id, name, category_id, image_path, image_paths, description, active, categories(name)').order('name'),
    supabase.from('crop_prices').select('product_id, grade, price, prev_price'),
    supabase.from('buyer_prices').select('product_id, grade, price, prev_price'),
  ]);
  fail('Could not load prices.')(k.error ?? p.error ?? c.error ?? b.error);
  const rows = (kind: PriceKind, d: typeof c.data): PriceRow[] => (d ?? []).map((r) => ({
    kind,
    productId: r.product_id,
    grade: r.grade,
    price: Number(r.price),
    prevPrice: r.prev_price == null ? null : Number(r.prev_price),
  }));
  return {
    categories: (k.data ?? []).map((r) => ({ id: r.id, name: r.name, imagePath: r.image_path, active: r.active })),
    products: (p.data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      categoryId: r.category_id,
      category: r.categories?.name ?? '',
      imagePath: r.image_path,
      imagePaths: r.image_paths ?? [],
      description: r.description ?? '',
      active: r.active,
    })),
    prices: [...rows('farmer', c.data), ...rows('buyer', b.data)],
  };
}

/** Insert or update a category/product, then swap its image if a new one was picked. */
async function saveWithImage(
  table: 'categories' | 'products',
  id: string | undefined,
  fields: Record<string, unknown>,
  image: PickedImage | undefined,
  oldPath: string | null | undefined,
  removeImage: boolean | undefined,
  failMsg: string,
): Promise<string> {
  let rowId = id;
  if (rowId) {
    fail(failMsg)((await supabase.from(table).update(fields).eq('id', rowId)).error);
  } else {
    const { data, error } = await supabase.from(table).insert(fields).select('id').single();
    fail(failMsg)(error);
    rowId = data!.id as string;
  }
  if (removeImage && !image && oldPath) {
    fail('Saved, but could not remove the image.')((await supabase.from(table).update({ image_path: null }).eq('id', rowId)).error);
    await removeStoredImage(oldPath);
  }
  if (image) {
    const path = await replaceImage(table, rowId, image, oldPath);
    fail('Saved, but could not attach the image.')((await supabase.from(table).update({ image_path: path }).eq('id', rowId)).error);
  }
  return rowId;
}

export interface CategoryInput { id?: string; name: string; active: boolean; image?: PickedImage; oldImagePath?: string | null; removeImage?: boolean }
export interface ProductInput extends CategoryInput { categoryId: string }

export const saveCategory = (c: CategoryInput) =>
  saveWithImage('categories', c.id, { name: c.name.trim(), active: c.active }, c.image, c.oldImagePath, c.removeImage,
    'Could not save that category (is the name already used?).');

export interface GalleryInput {
  /** Saved gallery paths to keep, in order. */
  keep: string[];
  /** Saved gallery paths the ops user removed; their files are deleted. */
  dropped: string[];
  added: PickedImage[];
}

export async function saveProduct(p: ProductInput & { description: string; gallery: GalleryInput }) {
  const description = p.description.trim();
  const id = await saveWithImage('products', p.id, { name: p.name.trim(), category_id: p.categoryId, active: p.active, description: description || null },
    p.image, p.oldImagePath, p.removeImage, 'Could not save that product (is the name already used?).');
  const { keep, dropped, added } = p.gallery;
  if (!dropped.length && !added.length) return;
  // One at a time: each upload path is stamped with Date.now().
  const paths = [...keep];
  for (const img of added) paths.push(await replaceImage('products', id, img));
  fail('Saved, but could not update the photos.')((await supabase.from('products').update({ image_paths: paths }).eq('id', id)).error);
  await Promise.all(dropped.map(removeStoredImage));
}

/** prev_price is set by a database trigger when the price changes. */
export async function setPrice(kind: PriceKind, productId: string, grade: string, price: number): Promise<void> {
  const { error } = await supabase
    .from(PRICE_TABLE[kind])
    .upsert({ product_id: productId, grade, price }, { onConflict: 'product_id,grade' });
  fail('Could not save the price.')(error);
}

export async function deletePrice(kind: PriceKind, productId: string, grade: string): Promise<void> {
  const { error } = await supabase.from(PRICE_TABLE[kind]).delete().eq('product_id', productId).eq('grade', grade);
  fail('Could not remove the price.')(error);
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

export type StaffRole = 'driver' | 'ops';

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
    .select('id, role, display_name, phone, email, created_at, drivers(vehicle_type, plate_number)')
    .in('role', ['driver', 'ops'])
    .order('created_at', { ascending: false });
  fail('Could not load the team.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.display_name ?? 'Unnamed',
    role: r.role,
    phone: r.phone ?? '',
    email: r.email ?? '',
    detail: [r.drivers?.vehicle_type, r.drivers?.plate_number].filter(Boolean).join(' · '),
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

export interface BuyerRow {
  id: string;
  name: string;
  location: string;
  phone: string;
  email: string;
  joinedAt: string;
}

const BUYER_COLS = 'id, organization_name, delivery_location, created_at, profiles!inner(phone, email)';

const toBuyer = (r: any): BuyerRow => ({
  id: r.id,
  name: r.organization_name ?? 'Unnamed buyer',
  location: r.delivery_location ?? '',
  phone: r.profiles?.phone ?? '',
  email: r.profiles?.email ?? '',
  joinedAt: r.created_at,
});

export async function fetchBuyers(): Promise<BuyerRow[]> {
  const { data, error } = await supabase.from('buyers').select(BUYER_COLS).order('created_at', { ascending: false });
  fail('Could not load buyers.')(error);
  return (data ?? []).map(toBuyer);
}

/** One page of buyers (newest first, optionally matching a search). */
export async function fetchBuyersPage(page: number, q: string): Promise<Paged<BuyerRow>> {
  const [from, to] = pageRange(page);
  let query = supabase.from('buyers').select(BUYER_COLS, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
  if (q.trim()) {
    const p = likeTerm(q);
    query = query.or(`organization_name.ilike.${p},delivery_location.ilike.${p},profiles.phone.ilike.${p}`);
  }
  const { data, error, count } = await query;
  fail('Could not load buyers.')(error);
  return { rows: (data ?? []).map(toBuyer), total: count ?? 0 };
}
