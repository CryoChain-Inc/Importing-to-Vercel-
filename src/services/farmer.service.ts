import { normalizePhone } from '../utils/format';
import type { PickedImage } from './catalogueImage';
import { supabase } from './supabase';

export interface Farmer {
  address: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  momoNetwork: string | null;
  momoNumber: string | null;
  momoName: string | null;
  walletVerified: boolean;
}

export interface FarmerDetails {
  name: string;
  address: string;
  locality: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Wallet {
  network: string;
  number: string;
  name: string;
}

export type ListingStage = 'available' | 'captured' | 'loaded' | 'delivered';

export interface ProduceListing {
  id: string;
  product: string;
  weightKg: number;
  createdAt: string;
  point: string;
  grade: string;
  imagePaths: string[];
  estNet: number | null;
  estFee: number | null;
  recordedKg: number | null;
  stage: ListingStage;
  inLot: boolean;
  lotCode: string | null;
}

export interface Estimate {
  pricePerKg: number;
  gross: number;
  feeRate: number;
  fee: number;
  net: number;
}

const PRODUCE_BUCKET = 'produce';
export const GRADES = ['A', 'B', 'C'];
export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 6;
export const produceImageUrl = (path: string) => supabase.storage.from(PRODUCE_BUCKET).getPublicUrl(path).data.publicUrl;

export interface CollectionPoint {
  id: string;
  name: string;
  address: string | null;
}

const FARMER_COLUMNS = 'address, locality, latitude, longitude, momo_network, momo_number, momo_name, wallet_verified_at';

export const hasWallet = (f: Farmer | null) => Boolean(f?.momoNumber);
export const detailsDone = (f: Farmer | null) => Boolean(f?.address);

async function userId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Sign in again to continue.');
  return data.user.id;
}

/** Role selection: sets the role and creates the empty farmers row. */
export async function createFarmer(): Promise<void> {
  const { error } = await supabase.rpc('complete_farmer_onboarding');
  if (error) throw new Error('Could not set up your farmer account.');
}

export async function fetchFarmer(): Promise<Farmer | null> {
  const id = await userId();
  const { data, error } = await supabase.from('farmers').select(FARMER_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error('Could not load your farm.');
  if (!data) return null;
  return {
    address: data.address,
    locality: data.locality,
    latitude: data.latitude,
    longitude: data.longitude,
    momoNetwork: data.momo_network,
    momoNumber: data.momo_number,
    momoName: data.momo_name,
    walletVerified: Boolean(data.wallet_verified_at),
  };
}

export async function saveDetails(d: FarmerDetails): Promise<void> {
  const { error } = await supabase.rpc('save_farmer_details', {
    p_name: d.name,
    p_address: d.address,
    p_locality: d.locality,
    p_latitude: d.latitude,
    p_longitude: d.longitude,
  });
  if (error) throw new Error('Could not save your details.');
}

/** Registered name for a MoMo wallet, or null when it can't be checked. Advisory: saving never depends on it. */
export async function lookupWalletName(network: string, number: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('verify-wallet', { body: { network, number: normalizePhone(number) } });
  return error || !data?.name ? null : String(data.name);
}

export async function saveWallet(w: Wallet): Promise<void> {
  const id = await userId();
  const { error } = await supabase
    .from('farmers')
    .update({ momo_network: w.network, momo_number: normalizePhone(w.number), momo_name: w.name.trim() })
    .eq('id', id);
  if (error) throw new Error('Could not save your wallet.');
}

const STAGES: ListingStage[] = ['available', 'captured', 'loaded', 'delivered'];

function toListing(row: any, stage: ListingStage = 'available'): ProduceListing {
  const recorded = stage === 'available' ? null : row.recorded_kg;
  return {
    id: row.id,
    product: row.product,
    weightKg: Number(row.weight_kg),
    createdAt: row.created_at,
    point: row.point ?? row.collection_points?.name ?? '',
    grade: row.grade,
    imagePaths: row.image_paths ?? [],
    estNet: row.est_net == null ? null : Number(row.est_net),
    estFee: row.est_fee == null ? null : Number(row.est_fee),
    recordedKg: recorded == null ? null : Number(recorded),
    stage: STAGES.includes(stage) ? stage : 'available',
    inLot: typeof row.in_lot === 'boolean' ? row.in_lot : row.lot_id != null,
    lotCode: row.lot_code ?? null,
  };
}

export async function fetchListings(): Promise<ProduceListing[]> {
  const listed = await supabase.rpc('farmer_listings');
  const missing = listed.error?.code === 'PGRST202' || (listed.error?.message ?? '').includes('Could not find the function');
  if (!missing) {
    if (listed.error) throw new Error('Could not load your listings.');
    return (listed.data ?? []).map((row: any) => toListing(row, STAGES.includes(row.stage) ? row.stage : 'available'));
  }
  const { data, error } = await supabase
    .from('produce_listings')
    .select('id, product, weight_kg, created_at, grade, image_paths, est_net, est_fee, lot_id, collection_points(name)')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load your listings.');
  return (data ?? []).map((row) => toListing(row));
}

export async function fetchCollectionPoints(): Promise<CollectionPoint[]> {
  const { data, error } = await supabase.from('collection_points').select('id, name, address').eq('active', true).order('name');
  if (error) throw new Error('Could not load collection points.');
  return data ?? [];
}

export async function fetchProductNames(): Promise<string[]> {
  const { data, error } = await supabase.from('products').select('name').eq('active', true).order('name');
  if (error) throw new Error('Could not load products.');
  return (data ?? []).map((r) => r.name);
}

/** Grades that have a published farm-gate price, keyed by product name. */
export async function fetchPricedGrades(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase.from('crop_prices').select('grade, products!inner(name)').eq('products.active', true);
  if (error) throw new Error('Could not load prices.');
  const found: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const name = (row as { products?: { name?: string } }).products?.name;
    const grade = (row as { grade?: string }).grade;
    if (!name || !grade) continue;
    (found[name] ??= []).push(grade);
  }
  for (const name of Object.keys(found)) found[name] = GRADES.filter((g) => found[name].includes(g));
  return found;
}

/** Expected payout for a listing: farm-gate price for the chosen grade x kg, less the collection fee. Null when no price is published. */
export async function estimateListing(product: string, kg: number, grade: string): Promise<Estimate | null> {
  const { data, error } = await supabase.rpc('estimate_listing', { p_product: product, p_kg: kg, p_grade: grade });
  if (error) throw new Error('Could not work out the expected payout.');
  const row = (Array.isArray(data) ? data[0] : data) as {
    price_per_kg?: number | string | null;
    gross?: number | string | null;
    fee_rate?: number | string | null;
    fee?: number | string | null;
    net?: number | string | null;
  } | null;
  if (row?.price_per_kg == null) return null;
  return { pricePerKg: Number(row.price_per_kg), gross: Number(row.gross), feeRate: Number(row.fee_rate), fee: Number(row.fee), net: Number(row.net) };
}

async function uploadPhotos(farmerId: string, images: PickedImage[]): Promise<string[]> {
  const paths: string[] = [];
  try {
    for (const img of images) {
      const type = img.mimeType ?? 'image/jpeg';
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type];
      if (!ext) throw new Error('Use JPEG, PNG or WebP photos.');
      const body = await (await fetch(img.uri)).arrayBuffer();
      const path = `${farmerId}/${Date.now()}-${paths.length}.${ext}`;
      const { error } = await supabase.storage.from(PRODUCE_BUCKET).upload(path, body, { contentType: type });
      if (error) throw new Error('Could not upload a photo (max 2 MB each).');
      paths.push(path);
    }
  } catch (e) {
    if (paths.length) await supabase.storage.from(PRODUCE_BUCKET).remove(paths);
    throw e;
  }
  return paths;
}

export async function createListing(pointId: string, product: string, weightKg: number, grade: string, images: PickedImage[]): Promise<void> {
  if (images.length < MIN_PHOTOS) throw new Error(`Add at least ${MIN_PHOTOS} photos.`);
  const farmerId = await userId();
  const paths = await uploadPhotos(farmerId, images);
  const { error } = await supabase
    .from('produce_listings')
    .insert({ farmer_id: farmerId, collection_point_id: pointId, product: product.trim(), weight_kg: weightKg, grade, image_paths: paths });
  if (error) {
    await supabase.storage.from(PRODUCE_BUCKET).remove(paths);
    throw new Error('Could not add the listing. Check your MoMo wallet, that the collection point is active and that the product has a published price.');
  }
}

function removalError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? '';
  if (msg.includes('already in a lot')) return new Error('This listing is already in a collection lot, so it can no longer be removed.');
  if (msg.includes('listing not found')) return new Error('That listing is no longer on your account.');
  return new Error('Could not remove that listing.');
}

export async function deleteListing(id: string): Promise<void> {
  const removed = await supabase.rpc('delete_own_listing', { p_id: id });
  const missing = removed.error?.code === 'PGRST202' || (removed.error?.message ?? '').includes('Could not find the function');
  const paths = missing ? await deleteListingDirect(id) : ((removed.data ?? []) as string[]);
  if (!missing && removed.error) throw removalError(removed.error);
  if (!paths.length) return;
  try {
    await supabase.storage.from(PRODUCE_BUCKET).remove(paths);
  } catch {
    // The listing row is already gone. A leftover photo should not keep it on screen.
  }
}

/** Used when the withdraw function is not on the database yet. Confirms a row actually went. */
async function deleteListingDirect(id: string): Promise<string[]> {
  const { data: row } = await supabase.from('produce_listings').select('image_paths, lot_id').eq('id', id).maybeSingle();
  if (row?.lot_id) throw new Error('This listing is already in a collection lot, so it can no longer be removed.');
  const { data, error } = await supabase.from('produce_listings').delete().eq('id', id).select('id');
  if (error) throw removalError(error);
  if (!data?.length) throw new Error('Could not remove that listing.');
  return (row?.image_paths ?? []) as string[];
}
