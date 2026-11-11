import { normalizePhone } from '../utils/format';
import { EXT, readBytes, type PickedImage } from './catalogueImage';
import { cached } from './offlineCache';
import type { AddressValue } from './maps.service';
import { requireUserId, supabase } from './supabase';

export interface Farmer {
  name: string;
  phone: string;
  address: string | null;
  line1: string | null;
  landmark: string | null;
  city: string | null;
  postcode: string | null;
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  momoNetwork: string | null;
  momoNumber: string | null;
  momoName: string | null;
  walletVerified: boolean;
}

export interface FarmerDetails extends AddressValue {
  name: string;
  locality: string;
}

export interface Wallet {
  network: string;
  number: string;
  name: string;
}

export interface ProduceListing {
  id: string;
  product: string;
  /** Kg the farmer listed. */
  weightKg: number;
  createdAt: string;
  unit: string;
  imagePaths: string[];
  estNet: number | null;
  estFee: number | null;
  /** Paid for by buyers and allocated to this listing (offered, accepted or collected). */
  soldKg: number;
  /** Allocated to a paid order and waiting for the driver. */
  reservedKg: number;
  /** Picked up by the driver. */
  collectedKg: number;
  deliveredKg: number;
  /** Declined or lapsed offers: no longer available from this listing. */
  withdrawnKg: number;
  remainingKg: number;
  /** What CryoChain owes for the sold kg, and how much of it has been paid out. */
  earned: number;
  paidOut: number;
}

export interface Estimate {
  pricePerKg: number;
  gross: number;
  feeRate: number;
  fee: number;
  net: number;
}

export interface CollectionPoint {
  id: string;
  name: string;
  address: string | null;
}

const PRODUCE_BUCKET = 'produce';
export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 6;
export const produceImageUrl = (path: string) => supabase.storage.from(PRODUCE_BUCKET).getPublicUrl(path).data.publicUrl;

const FARMER_COLUMNS = 'address, line1, landmark, city, postcode, locality, latitude, longitude, momo_network, momo_number, momo_name, wallet_verified_at, profiles(display_name, phone)';

/** Profile stores the nearest collection point as this label (see DetailsForm). */
export const pointLabel = (p: CollectionPoint) => (p.address ? `${p.name}, ${p.address}` : p.name);

export const hasWallet = (f: Farmer | null) => Boolean(f?.momoNumber);
export const detailsDone = (f: Farmer | null) => Boolean(f?.address);

async function userId(): Promise<string> {
  return requireUserId();
}

/** Role selection: sets the role and creates the empty farmers row. */
export async function createFarmer(): Promise<void> {
  const { error } = await supabase.rpc('complete_farmer_onboarding');
  if (error) throw new Error('Could not set up your farmer account.');
}

export const fetchFarmer = () => cached('fetchFarmer', loadFarmer);
async function loadFarmer(): Promise<Farmer | null> {
  const id = await userId();
  const { data, error } = await supabase.from('farmers').select(FARMER_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error('Could not load your farm.');
  if (!data) return null;
  const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
  return {
    name: profile?.display_name ?? '',
    phone: profile?.phone ?? '',
    address: data.address,
    line1: data.line1,
    landmark: data.landmark,
    city: data.city,
    postcode: data.postcode,
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
    p_line1: d.line1,
    p_landmark: d.landmark,
    p_city: d.city,
    p_postcode: d.postcode,
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

export const fetchListings = () => cached('fetchListings', loadListings);
async function loadListings(): Promise<ProduceListing[]> {
  const [listed, stock] = await Promise.all([
    supabase
      .from('produce_listings')
      .select('id, product, weight_kg, created_at, unit, image_paths, est_net, est_fee')
      .order('created_at', { ascending: false }),
    supabase.from('listing_stock').select('listing_id, sold_kg, reserved_kg, collected_kg, delivered_kg, withdrawn_kg, remaining_kg, earned, paid_out'),
  ]);
  if (listed.error || stock.error) throw new Error('Could not load your listings.');
  const byId = new Map((stock.data ?? []).map((r) => [r.listing_id as string, r]));
  return (listed.data ?? []).map((row: any) => {
    const st = byId.get(row.id);
    return {
      id: row.id,
      product: row.product,
      weightKg: Number(row.weight_kg),
      createdAt: row.created_at,
      unit: row.unit,
      imagePaths: row.image_paths ?? [],
      estNet: row.est_net == null ? null : Number(row.est_net),
      estFee: row.est_fee == null ? null : Number(row.est_fee),
      soldKg: Number(st?.sold_kg ?? 0),
      reservedKg: Number(st?.reserved_kg ?? 0),
      collectedKg: Number(st?.collected_kg ?? 0),
      deliveredKg: Number(st?.delivered_kg ?? 0),
      withdrawnKg: Number(st?.withdrawn_kg ?? 0),
      remainingKg: Number(st?.remaining_kg ?? row.weight_kg),
      earned: Number(st?.earned ?? 0),
      paidOut: Number(st?.paid_out ?? 0),
    };
  });
}

export interface Sale {
  id: string;
  listingId: string;
  product: string;
  unit: string;
  kg: number;
  pricePerKg: number;
  amount: number;
  /** Delivered to the buyer: the money is then payable, and later paid. */
  status: 'awaiting_delivery' | 'payable' | 'paid';
  createdAt: string;
  deliveredAt: string | null;
  paidAt: string | null;
}

/** What buyers' payments have allocated to this farmer, with where each payout stands. Declined offers are left out. */
export const fetchSales = () => cached('fetchSales', loadSales);
async function loadSales(): Promise<Sale[]> {
  const { data, error } = await supabase
    .from('order_allocations')
    .select('id, listing_id, unit, kg, farmer_price, amount, payout_status, created_at, delivered_at, paid_at, products(name)')
    .in('status', ['accepted', 'collected', 'offered'])
    .order('created_at', { ascending: false });
  if (error) throw new Error('Could not load your sales.');
  return (data ?? []).map((r: any) => ({
    id: r.id,
    listingId: r.listing_id,
    product: r.products?.name ?? '',
    unit: r.unit,
    kg: Number(r.kg),
    pricePerKg: Number(r.farmer_price),
    amount: Number(r.amount),
    status: r.payout_status === 'pending' ? 'awaiting_delivery' : r.payout_status,
    createdAt: r.created_at,
    deliveredAt: r.delivered_at,
    paidAt: r.paid_at,
  }));
}

export interface ProductOption {
  name: string;
  /** Comma-separated alternative names, matched by search. */
  aliases: string;
  /** The one unit this product is listed and paid in. */
  unit: string;
  /** Farm-gate price per unit. */
  price: number;
}

/** Active, priced products (the farmer's view of price_board()). */
export const fetchProductOptions = () => cached('fetchProductOptions', loadProductOptions);
async function loadProductOptions(): Promise<ProductOption[]> {
  const { data, error } = await supabase.rpc('price_board');
  if (error) throw new Error('Could not load products.');
  return (data ?? []).map((r: any): ProductOption => ({ name: r.product_name, aliases: r.aliases ?? '', unit: r.unit, price: Number(r.price) }));
}

/** Category name per product name, for grouping a farmer's listings. */
export const fetchProductCategories = () => cached('fetchProductCategories', loadProductCategories);
async function loadProductCategories(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('products').select('name, categories(name)');
  if (error) throw new Error('Could not load categories.');
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { name: string; categories?: { name?: string } | null }[]) if (r.categories?.name) out[r.name] = r.categories.name;
  return out;
}

/** Expected payout for a listing: farm-gate price for the chosen unit x quantity, less the collection fee. Null when no price is published. */
export async function estimateListing(product: string, kg: number, unit: string): Promise<Estimate | null> {
  const { data, error } = await supabase.rpc('estimate_listing', { p_product: product, p_kg: kg, p_unit: unit });
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

export async function updateListing(id: string, product: string, weightKg: number, unit: string): Promise<void> {
  const { error } = await supabase.rpc('update_own_listing', { p_id: id, p_product: product, p_unit: unit, p_weight_kg: weightKg });
  if (!error) return;
  const msg = error.message ?? '';
  if (msg.includes('already in a lot')) throw new Error('This listing is already being fulfilled, so it can no longer be edited.');
  if (msg.includes('been delivered')) throw new Error('This produce has been delivered, so it can no longer be edited.');
  if (msg.includes('been collected')) throw new Error('This produce has been collected, so it can no longer be edited.');
  const reserved = msg.match(/below the (\S+ \S+) already reserved/);
  if (reserved) throw new Error(`${reserved[1]} is already reserved for orders, so the quantity cannot go below that.`);
  if (msg.includes('no published price')) throw new Error(`No published price for ${product} (${unit}) yet.`);
  if (msg.includes('listing not found')) throw new Error('That listing is no longer on your account.');
  throw new Error('Could not save your changes.');
}

/**
 * Saves a listing's photos: `keep` are paths already stored, `added` are new picks. Returns nothing; the server decides
 * what may be removed (nothing once produce is reserved).
 */
export async function updateListingPhotos(id: string, keep: string[], added: PickedImage[]): Promise<void> {
  const uid = await userId();
  const uploaded: string[] = [];
  const bucket = supabase.storage.from(PRODUCE_BUCKET);
  try {
    for (const [i, img] of added.entries()) {
      const type = img.mimeType ?? 'image/jpeg';
      if (!EXT[type]) throw new Error('Use a JPEG, PNG or WebP image.');
      const body = await readBytes(img.uri);
      if (body.byteLength === 0) throw new Error('A photo could not be read. Pick it again.');
      const path = `${uid}/${id}-${Date.now()}-${i}.${EXT[type]}`;
      if ((await bucket.upload(path, body, { contentType: type })).error) throw new Error('Could not upload a photo (max 2 MB each).');
      uploaded.push(path);
    }
    const { data, error } = await supabase.rpc('update_own_listing_photos', { p_id: id, p_paths: [...keep, ...uploaded] });
    if (error) {
      const msg = error.message ?? '';
      if (msg.includes('cannot be removed')) throw new Error('This produce is reserved for an order, so its photos can be added to but not removed.');
      if (msg.includes('been delivered') || msg.includes('been collected')) throw new Error('This produce has been collected, so its photos can no longer change.');
      if (msg.includes('3 to 6')) throw new Error(`Keep ${MIN_PHOTOS} to ${MAX_PHOTOS} photos.`);
      throw new Error('Could not save the photos.');
    }
    const dropped = (data ?? []) as string[];
    // The listing is saved. A leftover file should not fail the edit.
    if (dropped.length) await bucket.remove(dropped).catch(() => undefined);
  } catch (e) {
    // Nothing points at these files, so they would only take up space.
    if (uploaded.length) await bucket.remove(uploaded).catch(() => undefined);
    throw e;
  }
}

function removalError(error: { message?: string; code?: string }): Error {
  const msg = error.message ?? '';
  if (msg.includes('already in a lot')) return new Error('This listing is already being fulfilled, so it can no longer be removed.');
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
  if (row?.lot_id) throw new Error('This listing is already being fulfilled, so it can no longer be removed.');
  const { data, error } = await supabase.from('produce_listings').delete().eq('id', id).select('id');
  if (error) throw removalError(error);
  if (!data?.length) throw new Error('Could not remove that listing.');
  return (row?.image_paths ?? []) as string[];
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  createdAt: string;
}

/** Updates the system sent this farmer: bought, pickup scheduled, weighed, delivered. */
export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await supabase.from('notifications').select('id, title, body, created_at').order('created_at', { ascending: false }).limit(10);
  if (error) throw new Error('Could not load your updates.');
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, body: r.body, createdAt: r.created_at }));
}

export interface Offer {
  id: string;
  product: string;
  unit: string;
  kg: number;
  /** What CryoChain pays this farmer for the allocation. */
  amount: number;
  status: 'offered' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'collected';
  /** When CryoChain collects it from the farm. */
  pickupAt: string | null;
  createdAt: string;
}

/** Pickups CryoChain has scheduled with this farmer. The buyer is never shown. */
export async function fetchOffers(): Promise<Offer[]> {
  const { data, error } = await supabase
    .from('order_allocations')
    .select('id, unit, kg, amount, status, pickup_at, created_at, products(name)')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error('Could not load your orders.');
  return (data ?? []).map((r: any) => ({
    id: r.id, product: r.products?.name ?? '', unit: r.unit, kg: Number(r.kg), amount: Number(r.amount),
    status: r.status, pickupAt: r.pickup_at, createdAt: r.created_at,
  }));
}
