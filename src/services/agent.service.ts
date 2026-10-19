import { accraToday } from '../utils/format';
import { photoBytes } from '../utils/photo';
import { produceImageUrl } from './farmer.service';
import { requireUserId, supabase } from './supabase';

export type CaptureGrade = 'A' | 'B' | 'Reject';

export interface AgentCapture {
  recordedKg: number;
  grade: CaptureGrade;
  photoPath: string;
  photoUrl: string | null;
}

export interface AgentFarmer {
  listingId: string;
  name: string;
  phone: string;
  product: string;
  listedKg: number;
  /** Grade the farmer declared when listing. */
  listedGrade: string;
  /** Public URLs of the farmer's listing photos. */
  photos: string[];
  /** What the listing estimated the farmer would net. */
  estNet: number | null;
  capture: AgentCapture | null;
  /** What the farmer will be paid for this capture, once the lot is delivered. */
  net: number | null;
}

export interface AgentStop {
  id: string;
  pointName: string;
  locality: string;
  windowStart: string | null;
  windowEnd: string | null;
  confirmed: boolean;
  farmers: AgentFarmer[];
}

interface PointEmbed {
  name: string;
  locality: string | null;
}

interface StopRow {
  id: string;
  collection_point_id: string;
  window_start: string | null;
  window_end: string | null;
  confirmed_at: string | null;
  collection_points: PointEmbed | PointEmbed[] | null;
}

interface ProfileEmbed {
  display_name: string | null;
  phone: string | null;
}

interface ListingRow {
  id: string;
  product: string;
  weight_kg: number | string;
  grade: string;
  image_paths: string[] | null;
  est_net: number | string | null;
  lot_id: string | null;
  collection_point_id: string | null;
  farmers: { profiles: ProfileEmbed | ProfileEmbed[] | null } | { profiles: ProfileEmbed | ProfileEmbed[] | null }[] | null;
}

interface CaptureRow {
  listing_id: string;
  recorded_kg: number | string;
  grade: CaptureGrade;
  photo_path: string;
}

const fail = (msg: string): never => {
  throw new Error(msg);
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Today's stops: the collection points of the paid lots on this agent's route. */
export async function fetchTodayRoute(): Promise<AgentStop[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('id, route_lots(lot_id), route_stops(id, collection_point_id, confirmed_at, window_start, window_end, collection_points(name, locality))')
    .eq('service_date', accraToday())
    .maybeSingle();
  if (error) fail('Could not load today\'s route.');
  const stopRows = (data?.route_stops ?? []) as unknown as StopRow[];
  if (!stopRows.length) return [];

  const lotIds = ((data?.route_lots ?? []) as { lot_id: string }[]).map((l) => l.lot_id);
  const { data: listingData, error: listingError } = await supabase
    .from('produce_listings')
    .select('id, product, grade, image_paths, est_net, weight_kg, lot_id, collection_point_id, farmers(profiles(display_name, phone))')
    .in('lot_id', lotIds);
  if (listingError) fail('Could not load the farmers on this route.');

  const listings = (listingData ?? []) as unknown as ListingRow[];
  const listingIds = listings.map((l) => l.id);
  const captures = new Map<string, CaptureRow>();
  const nets = new Map<string, number>();
  if (listingIds.length) {
    const [captureRes, settlementRes] = await Promise.all([
      supabase.from('captures').select('listing_id, recorded_kg, grade, photo_path').in('listing_id', listingIds),
      supabase.from('settlements').select('listing_id, net').in('listing_id', listingIds),
    ]);
    if (captureRes.error) fail('Could not load saved captures.');
    (captureRes.data ?? []).forEach((row) => captures.set((row as CaptureRow).listing_id, row as CaptureRow));
    (settlementRes.data ?? []).forEach((row) => nets.set(row.listing_id, Number(row.net)));
  }

  const urls = new Map<string, string>();
  const paths = [...captures.values()].map((c) => c.photo_path).filter(Boolean);
  if (paths.length) {
    const signed = await supabase.storage.from('captures').createSignedUrls(paths, 60 * 30);
    signed.data?.forEach((item) => {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    });
  }

  return stopRows
    .map((stop) => ({
      id: stop.id,
      pointName: one(stop.collection_points)?.name ?? 'Collection point',
      locality: one(stop.collection_points)?.locality ?? '',
      windowStart: stop.window_start,
      windowEnd: stop.window_end,
      confirmed: Boolean(stop.confirmed_at),
      farmers: listings
        .filter((l) => l.collection_point_id === stop.collection_point_id)
        .map((l) => {
          const saved = captures.get(l.id);
          const profile = one(one(l.farmers)?.profiles);
          return {
            listingId: l.id,
            name: profile?.display_name?.trim() || 'Unnamed farmer',
            phone: profile?.phone ?? '',
            product: l.product,
            listedKg: Number(l.weight_kg),
            listedGrade: l.grade,
            photos: (l.image_paths ?? []).map(produceImageUrl),
            estNet: l.est_net == null ? null : Number(l.est_net),
            net: nets.get(l.id) ?? null,
            capture: saved
              ? {
                  recordedKg: Number(saved.recorded_kg),
                  grade: saved.grade,
                  photoPath: saved.photo_path,
                  photoUrl: urls.get(saved.photo_path) ?? null,
                }
              : null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => (a.windowStart ?? '').localeCompare(b.windowStart ?? '') || a.pointName.localeCompare(b.pointName));
}

export async function saveCapture(
  listingId: string,
  input: { kg: number; grade: CaptureGrade; photo?: { uri: string; mime: string } | null; existingPath?: string },
): Promise<void> {
  const userId = await requireUserId();

  let path = input.existingPath ?? '';
  if (input.photo) {
    path = `${userId}/${listingId}.jpg`;
    const uploaded = await supabase.storage.from('captures').upload(path, await photoBytes(input.photo.uri), {
      upsert: true,
      contentType: input.photo.mime || 'image/jpeg',
    });
    if (uploaded.error) fail('Could not save the photograph.');
  }
  if (!path) fail('Take a photograph before saving.');

  const { error } = await supabase.from('captures').upsert(
    { listing_id: listingId, agent_id: userId, recorded_kg: input.kg, grade: input.grade, photo_path: path },
    { onConflict: 'listing_id' },
  );
  if (/row-level security/.test(error?.message ?? '')) fail('This stop is confirmed, so its captures can no longer change.');
  if (/locked/.test(error?.message ?? '')) fail('This lot has been delivered, so the capture can no longer change.');
  if (/no price for grade/.test(error?.message ?? '')) fail('There is no published price for that grade yet. Ask operations to set one.');
  if (error) fail('Could not save this capture.');
}

/** Marks the stop ready for collection once every farmer has a capture. */
export async function confirmStop(stopId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_stop', { p_stop_id: stopId });
  if (!error) return;
  const msg = error.message ?? '';
  if (/capture every farmer/.test(msg)) throw new Error('Capture every farmer at this stop before confirming the lot.');
  throw new Error('Could not confirm this lot.');
}

export interface CaptureEstimate {
  pricePerKg: number;
  gross: number;
  fee: number;
  net: number;
}

/** What a farmer would be paid for this weight and grade, by the same formula the settlement uses. Null when no price is set. */
export async function estimateCapture(product: string, kg: number, grade: CaptureGrade): Promise<CaptureEstimate | null> {
  if (grade === 'Reject') return { pricePerKg: 0, gross: 0, fee: 0, net: 0 };
  const { data, error } = await supabase.rpc('estimate_listing', { p_product: product, p_kg: kg, p_grade: grade });
  if (error) fail('Could not work out the farmer\'s amount.');
  const row = (data as { price_per_kg: number; gross: number; fee: number; net: number }[] | null)?.[0];
  return row ? { pricePerKg: Number(row.price_per_kg), gross: Number(row.gross), fee: Number(row.fee), net: Number(row.net) } : null;
}
