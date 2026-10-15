import { normalizePhone } from '../utils/format';
import { supabase } from './supabase';

export interface Farmer {
  address: string | null;
  locality: string | null;
  language: string | null;
  momoNetwork: string | null;
  momoNumber: string | null;
  momoName: string | null;
  walletVerified: boolean;
}

export interface FarmerDetails {
  name: string;
  address: string;
  locality: string;
  language: string;
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
}

export interface CollectionPoint {
  id: string;
  name: string;
}

const FARMER_COLUMNS = 'address, locality, language, momo_network, momo_number, momo_name, wallet_verified_at';

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
    language: data.language,
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
    p_language: d.language,
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
    .select('id, product, weight_kg, created_at, collection_points(name)')
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load your listings.');
  return (data ?? []).map((row: any) => ({
    id: row.id,
    product: row.product,
    weightKg: Number(row.weight_kg),
    createdAt: row.created_at,
    point: row.collection_points?.name ?? '',
  }));
}

export async function fetchCollectionPoints(): Promise<CollectionPoint[]> {
  const { data, error } = await supabase.from('collection_points').select('id, name').eq('active', true).order('name');
  if (error) throw new Error('Could not load collection points.');
  return data ?? [];
}

export async function fetchProductNames(): Promise<string[]> {
  const { data, error } = await supabase.from('products').select('name').eq('active', true).order('name');
  if (error) throw new Error('Could not load products.');
  return (data ?? []).map((r) => r.name);
}

export async function createListing(pointId: string, product: string, weightKg: number): Promise<void> {
  const farmerId = await userId();
  const { error } = await supabase
    .from('produce_listings')
    .insert({ farmer_id: farmerId, collection_point_id: pointId, product: product.trim(), weight_kg: weightKg });
  if (error) throw new Error('Could not add the listing. Check your MoMo wallet and that the collection point is active.');
}

export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase.from('produce_listings').delete().eq('id', id);
  if (error) throw new Error('Could not remove that listing.');
}
