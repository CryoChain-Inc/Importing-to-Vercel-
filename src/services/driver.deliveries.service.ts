import { readBytes, type PickedImage } from './catalogueImage';
import { requireUserId, supabase } from './supabase';

export type HandoverMediaKind = 'photo' | 'video';

export interface PickupStop {
  stopId: string;
  farmerName: string;
  farmerPhone: string;
  place: string;
  product: string;
  expectedKg: number;
  expectedUnit: string;
  lat: number;
  lng: number;
  state: 'pending' | 'done';
  seq: number | null;
  recordedKg: number | null;
  temperatureC: number | null;
  note: string;
  mediaPath: string | null;
  mediaKind: HandoverMediaKind | null;
  mediaUrl: string | null;
}

export interface DropoffStop {
  stopId: string;
  lat: number;
  lng: number;
  state: 'pending' | 'done';
  seq: number | null;
  temperatureC: number | null;
  note: string;
  mediaPath: string | null;
  mediaKind: HandoverMediaKind | null;
  mediaUrl: string | null;
}

export interface DeliveryOrder {
  id: string;
  code: string;
  ongoing: boolean;
  buyerName: string;
  buyerPhone: string;
  address: string;
  lat: number | null;
  lng: number | null;
  pickups: PickupStop[];
  dropoff: DropoffStop | null;
}

export interface DeliveryBook {
  tempMin: number | null;
  tempMax: number | null;
  orders: DeliveryOrder[];
}

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
const kindOf = (v: unknown): HandoverMediaKind | null => (v === 'video' || v === 'photo' ? v : null);

async function signedDelivery(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('deliveries').createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

const mapPickup = async (r: any): Promise<PickupStop> => ({
  stopId: r.stopId,
  farmerName: r.farmerName || 'Farmer',
  farmerPhone: r.farmerPhone ?? '',
  place: r.place ?? '',
  product: r.product ?? '',
  expectedKg: Number(r.expectedKg),
  expectedUnit: r.expectedUnit ?? 'kg',
  lat: Number(r.lat),
  lng: Number(r.lng),
  state: r.state,
  seq: r.seq == null ? null : Number(r.seq),
  recordedKg: num(r.recordedKg),
  temperatureC: num(r.temperatureC),
  note: r.note ?? '',
  mediaPath: r.mediaPath ?? null,
  mediaKind: kindOf(r.mediaKind),
  mediaUrl: await signedDelivery(r.mediaPath ?? null),
});

const mapDropoff = async (r: any): Promise<DropoffStop> => ({
  stopId: r.stopId,
  lat: Number(r.lat),
  lng: Number(r.lng),
  state: r.state,
  seq: r.seq == null ? null : Number(r.seq),
  temperatureC: num(r.temperatureC),
  note: r.note ?? '',
  mediaPath: r.mediaPath ?? null,
  mediaKind: kindOf(r.mediaKind),
  mediaUrl: await signedDelivery(r.mediaPath ?? null),
});

const mapOrder = async (r: any): Promise<DeliveryOrder> => ({
  id: r.id,
  code: r.code ?? '',
  ongoing: Boolean(r.ongoing),
  buyerName: r.buyerName || 'Buyer',
  buyerPhone: r.buyerPhone ?? '',
  address: r.address ?? '',
  lat: num(r.lat),
  lng: num(r.lng),
  pickups: await Promise.all((r.pickups ?? []).map(mapPickup)),
  dropoff: r.dropoff ? await mapDropoff(r.dropoff) : null,
});

/** This driver's produce orders, with the farmer and buyer details for each stop. */
export async function fetchDeliveries(): Promise<DeliveryBook> {
  const { data, error } = await supabase.rpc('driver_deliveries');
  if (error?.message.includes('Could not find the function') || error?.message.includes('driver_deliveries')) {
    throw new Error('Produce deliveries need the latest database update. Run it in the Supabase SQL editor, then try again.');
  }
  if (error?.message.includes('driver only')) throw new Error('Sign in as a driver to see deliveries.');
  if (error) throw new Error('Could not load your deliveries.');
  const row = (data ?? {}) as any;
  return {
    tempMin: num(row.tempMin),
    tempMax: num(row.tempMax),
    orders: await Promise.all((row.orders ?? []).map(mapOrder)),
  };
}

const MEDIA_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/** Stores the photo or short video the driver takes at a stop, under their own folder. */
export async function uploadHandoverMedia(stopId: string, file: PickedImage): Promise<{ path: string; kind: HandoverMediaKind }> {
  const type = file.mimeType || 'image/jpeg';
  const ext = MEDIA_EXT[type];
  if (!ext) throw new Error('Use a JPEG, PNG, WebP photo or an MP4 video.');
  const kind: HandoverMediaKind = type.startsWith('video/') ? 'video' : 'photo';
  const body = await readBytes(file.uri);
  if (body.byteLength === 0) throw new Error('That file could not be read. Try another photo or video.');
  if (body.byteLength > 25 * 1024 * 1024) throw new Error('That file is too large. Keep photos and videos under 25 MB.');
  const uid = await requireUserId();
  const path = `${uid}/${stopId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('deliveries').upload(path, body, { contentType: type, upsert: true });
  if (error) throw new Error('Could not upload that photo or video. Try again.');
  return { path, kind };
}

export async function recordHandover(stopId: string, reading: {
  kg: number | null;
  temp: number;
  note: string | null;
  mediaPath: string;
  mediaKind: HandoverMediaKind;
}): Promise<void> {
  const { error } = await supabase.rpc('record_delivery_handover', {
    p_stop: stopId,
    p_kg: reading.kg,
    p_celsius: reading.temp,
    p_note: reading.note,
    p_media_path: reading.mediaPath,
    p_media_kind: reading.mediaKind,
  });
  if (error?.message.includes('temperature out of range')) throw new Error('That temperature is outside the allowed range.');
  if (error?.message.includes('enter the kilos')) throw new Error('Enter the quantity you collected.');
  if (error?.message.includes('add a photo or video')) throw new Error('Add a photo or a short video of this stop.');
  if (error?.message.includes('note is too long')) throw new Error('Notes can be at most 280 characters.');
  if (error?.message.includes('no longer be changed')) throw new Error('This stop is already done, so the reading can no longer be changed.');
  if (error?.message.includes('stop not on your route')) throw new Error('That stop is not on your route.');
  if (error?.message.includes('Could not find the function')) throw new Error('Produce deliveries need the latest database update. Run it in the Supabase SQL editor, then try again.');
  if (error) throw new Error('Could not save that reading.');
}
