import { photoBytes } from '../utils/photo';
import { requireUserId, supabase } from './supabase';

export interface DriverStop {
  id: string;
  pointName: string;
  locality: string;
  windowStart: string | null;
  windowEnd: string | null;
  products: string[];
  farmers: number;
  listedKg: number;
  captured: number;
  capturedKg: number;
  confirmed: boolean;
  arrivedAt: string | null;
  temperatureC: number | null;
  departedAt: string | null;
}

export interface DriverDelivery {
  lotId: string;
  code: string;
  product: string;
  expectedKg: number;
  buyer: string;
  location: string;
  windowStart: string;
  windowEnd: string;
  deliveredAt: string | null;
  receivedBy: string;
}

export interface DriverRoute {
  id: string;
  plate: string;
  deliveredAt: string | null;
  stops: DriverStop[];
  deliveries: DriverDelivery[];
}

const explain = (error: { message?: string } | null, fallback: string) => {
  const msg = error?.message ?? '';
  if (/log the temperature/.test(msg)) throw new Error('Log the temperature before leaving.');
  if (/lot not ready/.test(msg)) throw new Error('The agent must capture every farmer and confirm this lot before you can leave.');
  if (/arrive first/.test(msg)) throw new Error('Confirm your arrival before logging the temperature.');
  if (/temperature out of range/.test(msg)) throw new Error('That temperature is outside the allowed range.');
  if (/enter the receiver/.test(msg)) throw new Error('Enter the name of the person receiving the load.');
  if (/take a photograph/.test(msg)) throw new Error('Take a photograph of the delivered load.');
  if (/finish every stop/.test(msg)) throw new Error('Load every stop before delivering.');
  if (/lot not on your route/.test(msg)) throw new Error('That lot is not on your route, or is already delivered.');
  throw new Error(fallback);
};

export async function fetchDriverRoute(): Promise<DriverRoute | null> {
  const { data, error } = await supabase.rpc('driver_today');
  if (error) throw new Error('Could not load today\'s route.');
  if (!data) return null;
  const row = data as DriverRoute;
  return {
    ...row,
    plate: row.plate ?? '',
    stops: (row.stops ?? []).map((stop) => ({
      ...stop,
      farmers: Number(stop.farmers),
      listedKg: Number(stop.listedKg),
      captured: Number(stop.captured),
      capturedKg: Number(stop.capturedKg),
      temperatureC: stop.temperatureC == null ? null : Number(stop.temperatureC),
    })),
    deliveries: (row.deliveries ?? []).map((d) => ({ ...d, expectedKg: Number(d.expectedKg), receivedBy: d.receivedBy ?? '' })),
  };
}

async function call(fn: string, args: Record<string, unknown>, fallback: string) {
  const { error } = await supabase.rpc(fn, args);
  if (error) explain(error, fallback);
}

export const arriveStop = (stopId: string) => call('arrive_stop', { p_stop_id: stopId }, 'Could not record your arrival.');

export const logTemperature = (stopId: string, celsius: number) =>
  call('log_stop_temperature', { p_stop_id: stopId, p_celsius: celsius }, 'Could not log the temperature.');

export const departStop = (stopId: string) => call('depart_stop', { p_stop_id: stopId }, 'Could not confirm that you are leaving.');

/** Hands one lot to its buyer. That is what makes the farmers' settlements for the lot payable. */
export async function completeLotDelivery(routeId: string, lotId: string, receiver: string, photo: { uri: string; mime: string }): Promise<void> {
  const userId = await requireUserId();
  const path = `${userId}/${routeId}-${lotId}.jpg`;
  const uploaded = await supabase.storage.from('deliveries').upload(path, await photoBytes(photo.uri), {
    upsert: true,
    contentType: photo.mime || 'image/jpeg',
  });
  if (uploaded.error) throw new Error('Could not save the photograph.');
  await call('complete_lot_delivery', { p_route_id: routeId, p_lot_id: lotId, p_receiver: receiver.trim(), p_photo_path: path }, 'Could not complete the delivery.');
}

/** What the agent recorded for one farmer at a stop. */
export interface StopCapture {
  listingId: string;
  farmer: string;
  product: string;
  listedKg: number;
  listedGrade: string;
  recordedKg: number | null;
  grade: string | null;
  photoUrl: string | null;
}

async function signed(bucket: 'captures' | 'deliveries', paths: string[]) {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const res = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 30);
  res.data?.forEach((i) => i.path && i.signedUrl && urls.set(i.path, i.signedUrl));
  return urls;
}

export async function fetchStopCaptures(stopId: string): Promise<StopCapture[]> {
  const { data, error } = await supabase.rpc('driver_stop_captures', { p_stop_id: stopId });
  if (error) throw new Error('Could not load what the agent captured.');
  const rows = (data ?? []) as any[];
  const urls = await signed('captures', rows.map((r) => r.photo_path).filter(Boolean));
  return rows.map((r) => ({
    listingId: r.listing_id,
    farmer: r.farmer,
    product: r.product,
    listedKg: Number(r.listed_kg),
    listedGrade: r.grade,
    recordedKg: r.recorded_kg == null ? null : Number(r.recorded_kg),
    grade: r.captured_grade,
    photoUrl: r.photo_path ? urls.get(r.photo_path) ?? null : null,
  }));
}

/** Delivery proof the driver already saved, keyed by lot id. */
export async function fetchDeliveryPhotos(routeId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('driver_delivery_photos', { p_route_id: routeId });
  if (error) throw new Error('Could not load your delivery photos.');
  const rows = (data ?? []) as { lot_id: string; photo_path: string | null }[];
  const urls = await signed('deliveries', rows.map((r) => r.photo_path).filter(Boolean) as string[]);
  const byLot = new Map<string, string>();
  rows.forEach((r) => r.photo_path && urls.get(r.photo_path) && byLot.set(r.lot_id, urls.get(r.photo_path)!));
  return byLot;
}
