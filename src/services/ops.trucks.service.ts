import { requireUserId, supabase } from './supabase';
import { fetchTruckHourRates, type TruckBooking, type TruckHourRate, type TruckPurpose } from './truck.service';

export type { TruckHourRate };

export interface OpsTruckBooking extends TruckBooking {
  buyer: string;
}

export interface TruckDriverOption {
  id: string;
  name: string;
  phone: string;
  plate: string;
  vehicle: string;
  available: boolean;
}

const fail = (error: { message: string } | null, known: Record<string, string>, fallback: string) => {
  if (!error) return;
  const hit = Object.keys(known).find((k) => error.message.includes(k));
  throw new Error(hit ? known[hit] : fallback);
};

export async function fetchOpsHourRates(): Promise<TruckHourRate[]> {
  return fetchTruckHourRates();
}

export async function addHourRate(hours: number, price: number): Promise<void> {
  await requireUserId();
  const { error } = await supabase.rpc('add_truck_hour_rate', { p_hours: hours, p_price: price });
  fail(error, {
    'ops only': 'Only operations can set hour packages.',
    'number of hours': 'Enter the number of hours for this package.',
    'price for that hour': 'Enter a price for that hour package.',
    'already exists': 'A package for that many hours already exists.',
  }, 'Could not add that hour package.');
}

export async function saveHourRate(id: string, price: number): Promise<void> {
  await requireUserId();
  const { error } = await supabase.rpc('set_truck_hour_rate', { p_id: id, p_price: price });
  fail(error, {
    'ops only': 'Only operations can set hour packages.',
    'price for that hour': 'Enter a price for that hour package.',
    'not found': 'That hour package is gone.',
  }, 'Could not save that hour package.');
}

export async function deleteHourRate(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.rpc('delete_truck_hour_rate', { p_id: id });
  fail(error, {
    'ops only': 'Only operations can remove hour packages.',
    'not found': 'That hour package is gone.',
  }, 'Could not remove that hour package.');
}

export async function fetchOpsTruckBookings(): Promise<OpsTruckBooking[]> {
  const columns = 'id, code, purpose, pickup_label, dropoff_label, distance_km, amount, pickup_at, booked_hours, hourly_price, elapsed_minutes, driver_id, driver_name, driver_phone, driver_plate, driver_vehicle, buyer_name, buyer_phone, started_at, completed_at, state, created_at, buyers(organization_name), truck_payments(status, created_at)';
  let { data, error } = await supabase.from('truck_bookings').select(columns).order('created_at', { ascending: false });
  if (error && /booked_hours|hourly_price|elapsed_minutes/.test(error.message)) {
    ({ data, error } = await supabase.from('truck_bookings').select(
      'id, code, purpose, pickup_label, dropoff_label, distance_km, amount, pickup_at, driver_id, driver_name, driver_phone, driver_plate, driver_vehicle, state, created_at, buyers(organization_name), truck_payments(status, created_at)',
    ).order('created_at', { ascending: false }));
  }
  fail(error, {}, 'Could not load truck bookings.');
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    purpose: r.purpose as TruckPurpose,
    pickupLabel: r.pickup_label,
    dropoffLabel: r.dropoff_label,
    distanceKm: Number(r.distance_km ?? 0),
    bookedHours: Number(r.booked_hours ?? 0),
    hourlyPrice: Number(r.hourly_price ?? r.amount ?? 0),
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
    elapsedMinutes: r.elapsed_minutes == null ? null : Number(r.elapsed_minutes),
    driverLat: r.driver_lat == null ? null : Number(r.driver_lat),
    driverLng: r.driver_lng == null ? null : Number(r.driver_lng),
    driverSeenAt: r.driver_seen_at ?? null,
    state: r.state,
    createdAt: r.created_at,
    payment: [...(r.truck_payments ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0]?.status ?? null,
    buyer: r.buyers?.organization_name ?? 'Buyer',
  }));
}

export async function fetchTruckDriverOptions(bookingId: string): Promise<TruckDriverOption[]> {
  const { data, error } = await supabase.rpc('truck_driver_options', { p_booking_id: bookingId });
  fail(error, {
    'ops only': 'Only operations can allot a driver.',
    'not found': 'That booking is gone.',
  }, 'Could not load available drivers.');
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name ?? 'Driver',
    phone: r.phone ?? '',
    plate: r.plate ?? '',
    vehicle: r.vehicle ?? '',
    available: !!r.available,
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

export async function assignTruckDriver(bookingId: string, driverId: string): Promise<void> {
  const { error } = await supabase.rpc('assign_truck_driver', { p_booking_id: bookingId, p_driver_id: driverId });
  fail(error, {
    'ops only': 'Only operations can allot a driver.',
    'not available': 'That driver already has a trip in this window.',
    'already started': 'This trip has already started.',
    'driver not found': 'That driver is no longer on the team.',
    'choose a driver': 'Choose a driver.',
    'cannot take a driver': 'That booking can no longer take a driver.',
  }, 'Could not allot that driver.');
}

export async function cancelOpsTruckBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_truck_booking', { p_booking_id: bookingId });
  fail(error, { 'cannot be cancelled': 'That booking can no longer be cancelled.' }, 'Could not cancel that booking.');
}
