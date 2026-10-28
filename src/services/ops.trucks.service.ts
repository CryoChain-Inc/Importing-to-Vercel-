import { requireUserId, supabase } from './supabase';
import type { TruckBooking, TruckPurpose } from './truck.service';

export interface TruckRate {
  pricePerKm: number;
}

export interface OpsTruckBooking extends TruckBooking {
  buyer: string;
}

const fail = (error: { message: string } | null, known: Record<string, string>, fallback: string) => {
  if (!error) return;
  const hit = Object.keys(known).find((k) => error.message.includes(k));
  throw new Error(hit ? known[hit] : fallback);
};

export async function fetchTruckRate(): Promise<TruckRate> {
  const { data, error } = await supabase.rpc('truck_rate');
  fail(error, {}, 'Could not load the truck rate.');
  return { pricePerKm: Number(data ?? 0) };
}

export async function saveTruckRate(pricePerKm: number): Promise<void> {
  await requireUserId();
  const { error } = await supabase.rpc('set_truck_rate', { p_price_per_km: pricePerKm });
  fail(error, {
    'ops only': 'Only operations can set the rate.',
    'price per kilometre': 'Enter a price per kilometre.',
  }, 'Could not save the rate.');
}

export async function fetchOpsTruckBookings(): Promise<OpsTruckBooking[]> {
  const columns = 'id, code, purpose, pickup_label, dropoff_label, distance_km, price_per_km, amount, pickup_at, driver_name, driver_phone, driver_plate, driver_vehicle, state, created_at, buyers(organization_name), truck_payments(status, created_at)';
  let { data, error } = await supabase.from('truck_bookings').select(`${columns}, completed_at`).order('created_at', { ascending: false });
  if (error && /completed_at/.test(error.message)) {
    ({ data, error } = await supabase.from('truck_bookings').select(columns).order('created_at', { ascending: false }));
  }
  fail(error, {}, 'Could not load truck bookings.');
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    purpose: r.purpose as TruckPurpose,
    pickupLabel: r.pickup_label,
    dropoffLabel: r.dropoff_label,
    distanceKm: Number(r.distance_km),
    pricePerKm: Number(r.price_per_km),
    amount: Number(r.amount),
    pickupAt: r.pickup_at,
    driverId: r.driver_id ?? '',
    driverName: r.driver_name ?? '',
    driverPhone: r.driver_phone ?? '',
    driverPlate: r.driver_plate ?? '',
    driverVehicle: r.driver_vehicle ?? '',
    buyerName: r.buyer_name ?? '',
    buyerPhone: r.buyer_phone ?? '',
    pickupLat: Number(r.pickup_lat ?? 0),
    pickupLng: Number(r.pickup_lng ?? 0),
    dropoffLat: Number(r.dropoff_lat ?? 0),
    dropoffLng: Number(r.dropoff_lng ?? 0),
    startedAt: r.started_at ?? null,
    completedAt: r.completed_at ?? null,
    driverLat: r.driver_lat == null ? null : Number(r.driver_lat),
    driverLng: r.driver_lng == null ? null : Number(r.driver_lng),
    driverSeenAt: r.driver_seen_at ?? null,
    state: r.state,
    createdAt: r.created_at,
    payment: [...(r.truck_payments ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0]?.status ?? null,
    buyer: r.buyers?.organization_name ?? 'Buyer',
  }));
}

export async function saveTruckFare(bookingId: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc('set_truck_fare', { p_booking_id: bookingId, p_amount: amount });
  fail(error, {
    'ops only': 'Only operations can change a fare.',
    'repriced': 'That booking can no longer be repriced.',
    'enter a fare': 'Enter a fare.',
  }, 'Could not update that fare.');
}

export async function confirmTruckPayment(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_truck_payment', { p_booking_id: bookingId });
  fail(error, {
    'ops only': 'Only operations can confirm a payment.',
    'not awaiting payment': 'That booking is not awaiting payment.',
  }, 'Could not confirm that payment.');
}

export async function assignTruckDriver(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_truck_driver', { p_booking_id: bookingId });
  fail(error, {
    'ops only': 'Only operations can assign a driver.',
    'no driver': 'Add a driver on the Team page first.',
    'cannot take a driver': 'That booking can no longer take a driver.',
  }, 'Could not assign a driver.');
}

export async function cancelOpsTruckBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_truck_booking', { p_booking_id: bookingId });
  fail(error, { 'cannot be cancelled': 'That booking can no longer be cancelled.' }, 'Could not cancel that booking.');
}
