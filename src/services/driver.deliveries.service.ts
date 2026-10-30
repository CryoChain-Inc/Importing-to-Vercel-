import { supabase } from './supabase';

export interface PickupStop {
  stopId: string;
  farmerName: string;
  farmerPhone: string;
  place: string;
  product: string;
  expectedKg: number;
  expectedGrade: string;
  lat: number;
  lng: number;
  state: 'pending' | 'done';
  seq: number | null;
  recordedKg: number | null;
  recordedGrade: string | null;
  temperatureC: number | null;
  note: string;
}

export interface DropoffStop {
  stopId: string;
  lat: number;
  lng: number;
  state: 'pending' | 'done';
  seq: number | null;
  temperatureC: number | null;
  note: string;
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

const mapPickup = (r: any): PickupStop => ({
  stopId: r.stopId,
  farmerName: r.farmerName || 'Farmer',
  farmerPhone: r.farmerPhone ?? '',
  place: r.place ?? '',
  product: r.product ?? '',
  expectedKg: Number(r.expectedKg),
  expectedGrade: r.expectedGrade ?? '',
  lat: Number(r.lat),
  lng: Number(r.lng),
  state: r.state,
  seq: r.seq == null ? null : Number(r.seq),
  recordedKg: num(r.recordedKg),
  recordedGrade: r.recordedGrade ?? null,
  temperatureC: num(r.temperatureC),
  note: r.note ?? '',
});

const mapDropoff = (r: any): DropoffStop => ({
  stopId: r.stopId,
  lat: Number(r.lat),
  lng: Number(r.lng),
  state: r.state,
  seq: r.seq == null ? null : Number(r.seq),
  temperatureC: num(r.temperatureC),
  note: r.note ?? '',
});

const mapOrder = (r: any): DeliveryOrder => ({
  id: r.id,
  code: r.code ?? '',
  ongoing: Boolean(r.ongoing),
  buyerName: r.buyerName || 'Buyer',
  buyerPhone: r.buyerPhone ?? '',
  address: r.address ?? '',
  lat: num(r.lat),
  lng: num(r.lng),
  pickups: (r.pickups ?? []).map(mapPickup),
  dropoff: r.dropoff ? mapDropoff(r.dropoff) : null,
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
    orders: (row.orders ?? []).map(mapOrder),
  };
}

export async function recordHandover(stopId: string, reading: { kg: number | null; grade: string | null; temp: number; note: string | null }): Promise<void> {
  const { error } = await supabase.rpc('record_delivery_handover', {
    p_stop: stopId,
    p_kg: reading.kg,
    p_grade: reading.grade,
    p_celsius: reading.temp,
    p_note: reading.note,
  });
  if (error?.message.includes('temperature out of range')) throw new Error('That temperature is outside the allowed range.');
  if (error?.message.includes('enter the kilos')) throw new Error('Enter the kilos you collected.');
  if (error?.message.includes('choose a grade')) throw new Error('Choose the grade you collected.');
  if (error?.message.includes('note is too long')) throw new Error('Notes can be at most 280 characters.');
  if (error?.message.includes('no longer be changed')) throw new Error('This stop is already done, so the reading can no longer be changed.');
  if (error?.message.includes('stop not on your route')) throw new Error('That stop is not on your route.');
  if (error?.message.includes('Could not find the function')) throw new Error('Produce deliveries need the latest database update. Run it in the Supabase SQL editor, then try again.');
  if (error) throw new Error('Could not save that reading.');
}
