import { supabase } from './supabase';

const fail = (msg: string) => (error: unknown) => {
  if (error) throw new Error(msg);
};

export type AllocationStatus = 'offered' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'collected';

export interface BoardAllocation {
  id: string;
  product: string;
  grade: string;
  farmer: string;
  kg: number;
  amount: number;
  status: AllocationStatus;
  expiresAt: string;
  kmToBuyer: number | null;
}

export interface BoardStop {
  id: string;
  kind: 'pickup' | 'dropoff';
  label: string;
  seq: number | null;
  state: 'pending' | 'done';
  doneAt: string | null;
  driver: string;
}

export interface BoardOrder {
  id: string;
  code: string;
  buyer: string;
  amount: number;
  state: 'awaiting_payment' | 'paid' | 'cancelled';
  createdAt: string;
  address: string;
  items: string[];
  allocations: BoardAllocation[];
  stops: BoardStop[];
}

/** Every cart order with who supplies it, what we pay them and where the driver is in the route. */
export async function fetchBoard(): Promise<BoardOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`id, code, amount, state, created_at, delivery_address, buyers(organization_name),
      order_items(grade, kg, products(name)),
      order_allocations(id, grade, kg, amount, status, expires_at, km_to_buyer, products(name), profiles(display_name)),
      delivery_stops(id, kind, label, seq, state, done_at, drivers(profiles(display_name)))`)
    .not('delivery_address', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);
  fail('Could not load orders.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    buyer: r.buyers?.organization_name || 'Buyer',
    amount: Number(r.amount),
    state: r.state,
    createdAt: r.created_at,
    address: r.delivery_address ?? '',
    items: (r.order_items ?? []).map((i: any) => `${i.products?.name ?? 'Item'} ${i.grade} · ${Number(i.kg).toLocaleString('en-GH')} kg`),
    allocations: (r.order_allocations ?? []).map((a: any) => ({
      id: a.id,
      product: a.products?.name ?? '',
      grade: a.grade,
      farmer: a.profiles?.display_name || 'Farmer',
      kg: Number(a.kg),
      amount: Number(a.amount),
      status: a.status,
      expiresAt: a.expires_at,
      kmToBuyer: a.km_to_buyer == null ? null : Number(a.km_to_buyer),
    })),
    stops: (r.delivery_stops ?? [])
      .map((s: any) => ({ id: s.id, kind: s.kind, label: s.label, seq: s.seq, state: s.state, doneAt: s.done_at, driver: s.drivers?.profiles?.display_name ?? '' }))
      .sort((a: BoardStop, b: BoardStop) => (a.seq ?? 999) - (b.seq ?? 999)),
  }));
}

export interface DriverRoute {
  id: string;
  name: string;
  phone: string;
  vehicle: string;
  /** Last ping; null when this driver has never shared a location. */
  seenAt: string | null;
  lat: number | null;
  lng: number | null;
  stops: { id: string; kind: 'pickup' | 'dropoff'; label: string; seq: number | null; state: 'pending' | 'done'; order: string; reading: string | null }[];
}

const readingOf = (h: any): string | null => {
  const row = Array.isArray(h) ? h[0] : h;
  if (!row) return null;
  const parts = [
    row.recorded_kg != null ? `${Number(row.recorded_kg)} kg` : '',
    row.grade ? `grade ${row.grade}` : '',
    row.temperature_c != null ? `${Number(row.temperature_c)}°C` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
};

export async function fetchDriverRoutes(): Promise<DriverRoute[]> {
  const drivers = supabase.from('drivers').select('id, plate_number, vehicle_type, profiles(display_name, phone), driver_locations(lat, lng, updated_at)');
  const withReading = 'id, driver_id, kind, label, seq, state, orders(code), delivery_handovers(recorded_kg, grade, temperature_c)';
  type StopQuery = { data: any[] | null; error: { message: string } | null };
  let stops = await supabase.from('delivery_stops').select(withReading).not('driver_id', 'is', null).order('seq', { nullsFirst: false }) as unknown as StopQuery;
  if (stops.error && /delivery_handovers|relationship|schema cache/i.test(stops.error.message)) {
    stops = await supabase.from('delivery_stops').select('id, driver_id, kind, label, seq, state, orders(code)').not('driver_id', 'is', null).order('seq', { nullsFirst: false }) as unknown as StopQuery;
  }
  const d = await drivers;
  fail('Could not load drivers.')(d.error ?? stops.error);
  return (d.data ?? []).map((r: any) => {
    const loc = Array.isArray(r.driver_locations) ? r.driver_locations[0] : r.driver_locations;
    return {
      id: r.id,
      name: r.profiles?.display_name || 'Driver',
      phone: r.profiles?.phone ?? '',
      vehicle: [r.vehicle_type, r.plate_number].filter(Boolean).join(' · '),
      seenAt: loc?.updated_at ?? null,
      lat: loc ? Number(loc.lat) : null,
      lng: loc ? Number(loc.lng) : null,
      stops: (stops.data ?? []).filter((x: any) => x.driver_id === r.id)
        .map((x: any) => ({ id: x.id, kind: x.kind, label: x.label, seq: x.seq, state: x.state, order: x.orders?.code ?? '', reading: readingOf(x.delivery_handovers) })),
    };
  });
}

export interface Decision {
  id: string;
  kind: 'no_supply' | 'no_farmer_price' | 'no_driver' | 'sms_failed' | 'allocation_error';
  orderId: string | null;
  order: string;
  summary: string;
  status: 'open' | 'resolved';
  resolution: string;
  createdAt: string;
  resolvedAt: string | null;
}

export async function fetchDecisions(): Promise<Decision[]> {
  const { data, error } = await supabase
    .from('ops_decisions')
    .select('id, kind, order_id, summary, status, resolution, created_at, resolved_at, orders(code)')
    .order('created_at', { ascending: false })
    .limit(100);
  fail('Could not load the decision register.')(error);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    kind: r.kind,
    orderId: r.order_id,
    order: r.orders?.code ?? '',
    summary: r.summary,
    status: r.status,
    resolution: r.resolution ?? '',
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
}

export async function resolveDecision(id: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('ops_resolve_decision', { p_id: id, p_note: note });
  if (error?.message.includes('write what you decided')) throw new Error('Write what you decided, so the register explains itself later.');
  fail('Could not resolve that decision.')(error);
}

/** Re-runs allocation for an order: tops up whatever is still uncovered and re-plans routes. */
export async function retryAllocation(orderId: string): Promise<void> {
  const { error } = await supabase.rpc('ops_retry_allocation', { p_order: orderId });
  if (error?.message.includes('been delivered')) throw new Error('This order has been delivered, so it can no longer be changed.');
  fail('Could not retry the allocation.')(error);
  await sendQueuedSms();
}

export async function replanRoutes(): Promise<void> {
  const { error } = await supabase.rpc('ops_replan_routes');
  fail('Could not re-plan the routes.')(error);
}

/** Sends any queued farmer SMS through Twilio. Quietly does nothing if the function or Twilio is not set up. */
export async function sendQueuedSms(): Promise<void> {
  await supabase.functions.invoke('dispatch-sms').catch(() => undefined);
}
