import { accraToday } from '../utils/format';
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
  capture: AgentCapture | null;
}

export interface AgentStop {
  id: string;
  pointName: string;
  locality: string;
  product: string;
  confirmed: boolean;
  farmers: AgentFarmer[];
}

interface PointEmbed {
  name: string;
  locality: string | null;
}

interface StopRow {
  id: string;
  product: string;
  collection_point_id: string;
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

export async function fetchTodayRoute(): Promise<AgentStop[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('id, route_stops(id, product, collection_point_id, confirmed_at, collection_points(name, locality))')
    .eq('service_date', accraToday())
    .maybeSingle();
  if (error) fail('Could not load today\'s route.');
  const stopRows = (data?.route_stops ?? []) as unknown as StopRow[];
  if (!stopRows.length) return [];

  const pointIds = [...new Set(stopRows.map((s) => s.collection_point_id))];
  const { data: listingData, error: listingError } = await supabase
    .from('produce_listings')
    .select('id, product, weight_kg, collection_point_id, farmers(profiles(display_name, phone))')
    .in('collection_point_id', pointIds);
  if (listingError) fail('Could not load the farmers on this route.');

  const listings = (listingData ?? []) as unknown as ListingRow[];
  const listingIds = listings.map((l) => l.id);
  const captures = new Map<string, CaptureRow>();
  if (listingIds.length) {
    const { data: captureData, error: captureError } = await supabase
      .from('captures')
      .select('listing_id, recorded_kg, grade, photo_path')
      .in('listing_id', listingIds);
    if (captureError) fail('Could not load saved captures.');
    (captureData ?? []).forEach((row) => captures.set((row as CaptureRow).listing_id, row as CaptureRow));
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
      product: stop.product,
      confirmed: Boolean(stop.confirmed_at),
      farmers: listings
        .filter((l) => l.collection_point_id === stop.collection_point_id && l.product === stop.product)
        .map((l) => {
          const saved = captures.get(l.id);
          const profile = one(one(l.farmers)?.profiles);
          return {
            listingId: l.id,
            name: profile?.display_name?.trim() || 'Unnamed farmer',
            phone: profile?.phone ?? '',
            product: l.product,
            listedKg: Number(l.weight_kg),
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
    .sort((a, b) => a.pointName.localeCompare(b.pointName) || a.product.localeCompare(b.product));
}

export async function saveCapture(
  listingId: string,
  input: { kg: number; grade: CaptureGrade; photo?: { uri: string; mime: string } | null; existingPath?: string },
): Promise<void> {
  const userId = await requireUserId();

  let path = input.existingPath ?? '';
  if (input.photo) {
    path = `${userId}/${listingId}.jpg`;
    const blob = await (await fetch(input.photo.uri)).blob();
    const uploaded = await supabase.storage.from('captures').upload(path, blob, {
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
