import { Linking, Platform } from 'react-native';
import { requireUserId, supabase } from './supabase';

export type TruckPurpose = 'transfer' | 'pickup';
export type TruckState = 'awaiting_payment' | 'paid' | 'cancelled';

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

export interface TruckQuote {
  distanceKm: number;
  pricePerKm: number;
  amount: number;
}

export interface TruckBooking {
  id: string;
  code: string;
  purpose: TruckPurpose;
  pickupLabel: string;
  dropoffLabel: string;
  distanceKm: number;
  pricePerKm: number;
  amount: number;
  pickupAt: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  driverPlate: string;
  driverVehicle: string;
  buyerName: string;
  buyerPhone: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  startedAt: string | null;
  completedAt: string | null;
  driverLat: number | null;
  driverLng: number | null;
  driverSeenAt: string | null;
  state: TruckState;
  createdAt: string;
  payment: 'pending' | 'success' | 'failed' | 'abandoned' | 'mismatch' | 'orphaned' | null;
}

const rpcError = (error: { message: string } | null, known: Record<string, string>, fallback: string) => {
  if (!error) return;
  const hit = Object.keys(known).find((k) => error.message.includes(k));
  throw new Error(hit ? known[hit] : fallback);
};

const mapBooking = (r: any): TruckBooking => ({
  id: r.id,
  code: r.code,
  purpose: r.purpose,
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
});

const COORDS = ', pickup_lat, pickup_lng, dropoff_lat, dropoff_lng';
const LIVE = ', started_at, driver_lat, driver_lng, driver_seen_at';
const ENDED = ', completed_at';
const BOOKING_COLUMNS = `id, code, purpose, pickup_label, dropoff_label, distance_km, price_per_km, amount, pickup_at, driver_id, driver_name, driver_phone, driver_plate, driver_vehicle, buyer_name, buyer_phone, state, created_at, truck_payments(status, created_at)${COORDS}${LIVE}${ENDED}`;
const BOOKING_COLUMNS_BASE = `id, code, purpose, pickup_label, dropoff_label, distance_km, price_per_km, amount, pickup_at, driver_name, driver_phone, driver_plate, driver_vehicle, state, created_at, truck_payments(status, created_at)${COORDS}`;

async function selectBookings(columns: string, filter?: { driverId: string }) {
  let query = supabase.from('truck_bookings').select(columns).order(filter ? 'pickup_at' : 'created_at', { ascending: !!filter });
  if (filter) query = query.eq('driver_id', filter.driverId).neq('state', 'cancelled');
  return query;
}

export async function fetchTruckBookings(): Promise<TruckBooking[]> {
  let { data, error } = await selectBookings(BOOKING_COLUMNS);
  if (error && /completed_at/.test(error.message)) {
    ({ data, error } = await selectBookings(BOOKING_COLUMNS.replace(ENDED, '')));
  }
  if (error && /buyer_name|buyer_phone|driver_id|started_at|driver_lat|driver_seen_at/.test(error.message)) {
    ({ data, error } = await selectBookings(BOOKING_COLUMNS_BASE));
  }
  rpcError(error, { 'truck_bookings': 'Truck booking is not available yet. Apply the latest database update, then try again.' }, 'Could not load your truck bookings.');
  return (data ?? []).map(mapBooking);
}

/** Trips assigned to the signed-in driver, including ones still awaiting payment so the buyer can reach them. */
export async function fetchDriverTrips(): Promise<TruckBooking[]> {
  const id = await requireUserId();
  const tripColumns = `id, code, purpose, pickup_label, dropoff_label, distance_km, price_per_km, amount, pickup_at, driver_id, driver_name, driver_phone, driver_plate, driver_vehicle, buyer_name, buyer_phone, state, created_at${COORDS}${LIVE}${ENDED}`;
  let { data, error } = await selectBookings(tripColumns, { driverId: id });
  if (error && /completed_at/.test(error.message)) {
    ({ data, error } = await selectBookings(tripColumns.replace(ENDED, ''), { driverId: id }));
  }
  if (error && /buyer_name|buyer_phone|driver_id|started_at|driver_lat|driver_seen_at/.test(error.message)) {
    ({ data, error } = await selectBookings(
      `id, code, purpose, pickup_label, dropoff_label, distance_km, price_per_km, amount, pickup_at, driver_name, driver_phone, driver_plate, driver_vehicle, state, created_at${COORDS}`,
      { driverId: id },
    ));
  }
  if (error) return [];
  return (data ?? []).map(mapBooking);
}

export async function quoteTruck(from: Place, to: Place): Promise<TruckQuote> {
  const { data, error } = await supabase.rpc('truck_quote', {
    p_lat1: from.lat, p_lng1: from.lng, p_lat2: to.lat, p_lng2: to.lng,
  });
  rpcError(error, {
    'not signed in': 'Sign in again to continue.',
    'different places': 'Choose two different places.',
    'price per kilometre': 'Operations has not set a price per kilometre yet.',
    'Could not find the function': 'Truck booking is not available yet. Apply the latest database update, then try again.',
  }, 'Could not price that trip.');
  const row = Array.isArray(data) ? data[0] : data;
  return { distanceKm: Number(row.distance_km), pricePerKm: Number(row.price_per_km), amount: Number(row.amount) };
}

export async function bookTruck(input: {
  purpose: TruckPurpose;
  pickup: Place;
  dropoff: Place;
  pickupAt: Date;
}): Promise<string> {
  await requireUserId();
  const { data, error } = await supabase.rpc('book_truck', {
    p_purpose: input.purpose,
    p_pickup_label: input.pickup.label,
    p_pickup_lat: input.pickup.lat,
    p_pickup_lng: input.pickup.lng,
    p_dropoff_label: input.dropoff.label,
    p_dropoff_lat: input.dropoff.lat,
    p_dropoff_lng: input.dropoff.lng,
    p_pickup_at: input.pickupAt.toISOString(),
  });
  rpcError(error, {
    'buyers only': 'Only a buyer can book a truck.',
    'not signed in': 'Sign in again to continue.',
    'in the future': 'Choose a pickup time that is still ahead.',
    'both places': 'Enter a pickup and a drop-off.',
    'different places': 'Choose two different places.',
    'price per kilometre': 'Operations has not set a price per kilometre yet.',
    'Could not find the function': 'Truck booking is not available yet. Apply the latest database update, then try again.',
  }, 'Could not book that truck.');
  return data as string;
}

export async function cancelTruckBooking(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.rpc('cancel_truck_booking', { p_booking_id: id });
  rpcError(error, {
    'not signed in': 'Sign in again to continue.',
    'cannot be cancelled': 'This booking can no longer be cancelled.',
  }, 'Could not cancel that booking.');
}

/** Opens Paystack checkout for an unpaid cold-truck booking. Stored on truck_payments, not lot payments. */
export async function payTruck(bookingId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('truck-pay', { body: { booking_id: bookingId } });
  if (error || !data?.url) {
    const body = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    throw new Error(body?.error ?? data?.error ?? 'Could not start the truck payment. Please try again.');
  }
  if (Platform.OS === 'web') window.location.assign(data.url);
  else await Linking.openURL(data.url);
}

/** Confirms a Paystack return for a truck booking reference (TRK-...). */
export async function verifyTruckPayment(reference: string): Promise<void> {
  const { error } = await supabase.functions.invoke('truck-pay-verify', { body: { reference } });
  if (error) {
    const body = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    throw new Error(body?.error ?? 'Could not confirm the truck payment yet.');
  }
}

/** The four-digit code only the buyer can read. Null until the payment migration is applied. */
export async function fetchStartCode(bookingId: string): Promise<string | null> {
  const { data, error } = await supabase.from('truck_start_codes').select('code').eq('booking_id', bookingId).maybeSingle();
  if (error || !data?.code) return null;
  return data.code;
}

export async function startTruckTrip(bookingId: string, code: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.rpc('start_truck_trip', { p_booking_id: bookingId, p_code: code.trim() });
  rpcError(error, {
    'not your trip': 'This trip is not assigned to you.',
    'pay before starting': 'The buyer has to pay before the trip can start.',
    'already started': 'This trip has already started.',
    'not right': 'That code does not match. Ask the buyer for the code on their trip.',
    'Could not find the function': 'Starting a trip is not available yet. Apply the latest database update, then try again.',
  }, 'Could not start that trip.');
}

/** The assigned driver ends a trip that has already started. */
export async function completeTruckTrip(bookingId: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.rpc('complete_truck_trip', { p_booking_id: bookingId });
  rpcError(error, {
    'not your trip': 'This trip is not assigned to you.',
    'pay before ending': 'The buyer has to pay before the trip can end.',
    'has not started': 'Start the trip with the buyer’s code before ending it.',
    'already ended': 'This trip has already ended.',
    'Could not find the function': 'Ending a trip is not available yet. Apply the latest database update, then try again.',
  }, 'Could not end that trip.');
}

export async function reportTruckLocation(bookingId: string, lat: number, lng: number): Promise<void> {
  const { error } = await supabase.rpc('report_truck_location', { p_booking_id: bookingId, p_lat: lat, p_lng: lng });
  if (error && !/has not started|not valid/.test(error.message)) throw new Error('Could not share your location.');
}

export async function fetchTripLive(bookingId: string): Promise<{ startedAt: string | null; completedAt: string | null; driverLat: number | null; driverLng: number | null; driverSeenAt: string | null } | null> {
  let { data, error } = await supabase.from('truck_bookings').select('started_at, completed_at, driver_lat, driver_lng, driver_seen_at').eq('id', bookingId).maybeSingle();
  if (error && /completed_at/.test(error.message)) {
    ({ data, error } = await supabase.from('truck_bookings').select('started_at, driver_lat, driver_lng, driver_seen_at').eq('id', bookingId).maybeSingle());
  }
  if (error || !data) return null;
  return {
    startedAt: data.started_at,
    completedAt: data.completed_at ?? null,
    driverLat: data.driver_lat == null ? null : Number(data.driver_lat),
    driverLng: data.driver_lng == null ? null : Number(data.driver_lng),
    driverSeenAt: data.driver_seen_at,
  };
}
