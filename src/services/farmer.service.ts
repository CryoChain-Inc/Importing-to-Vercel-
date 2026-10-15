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

export async function saveWallet(w: Wallet): Promise<void> {
  const id = await userId();
  const { error } = await supabase
    .from('farmers')
    .update({ momo_network: w.network, momo_number: normalizePhone(w.number), momo_name: w.name.trim() })
    .eq('id', id);
  if (error) throw new Error('Could not save your wallet.');
}

export async function fetchListings(): Promise<ProduceListing[]> {
  const { data, error } = await supabase
    .from('produce_listings')
    .select('id, product, weight_kg, created_at, grade, image_paths, est_net, est_fee, collection_points(name)')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load your listings.');
  return (data ?? []).map((row: any) => ({
    id: row.id,
    product: row.product,
    weightKg: Number(row.weight_kg),
    createdAt: row.created_at,
    point: row.collection_points?.name ?? '',
    grade: row.grade,
    imagePaths: row.image_paths ?? [],
    estNet: row.est_net == null ? null : Number(row.est_net),
    estFee: row.est_fee == null ? null : Number(row.est_fee),
  }));
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

/** Expected payout for a listing: farm-gate price for the chosen grade x kg, less the collection fee. Null when no price is published. */
export async function estimateListing(product: string, kg: number, grade: string): Promise<Estimate | null> {
  const { data, error } = await supabase.rpc('estimate_listing', { p_product: product, p_kg: kg, p_grade: grade });
  if (error) throw new Error('Could not work out the expected payout.');
  const r = data?.[0];
  if (!r) return null;
  return { pricePerKg: Number(r.price_per_kg), gross: Number(r.gross), feeRate: Number(r.fee_rate), fee: Number(r.fee), net: Number(r.net) };
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

export async function deleteListing(id: string): Promise<void> {
  const { data } = await supabase.from('produce_listings').select('image_paths').eq('id', id).maybeSingle();
  const { error } = await supabase.from('produce_listings').delete().eq('id', id);
  if (error) throw new Error('Could not remove that listing.');
  if (data?.image_paths?.length) await supabase.storage.from(PRODUCE_BUCKET).remove(data.image_paths);
}
