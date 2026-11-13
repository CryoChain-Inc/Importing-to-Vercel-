import { supabase } from './supabase';
import { likeTerm, pageRange, type Paged } from './paging';

const fail = (msg: string) => (error: unknown) => {
  if (error) throw new Error(msg);
};

export type AllocationStatus = 'offered' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'collected';
export type MediaKind = 'photo' | 'video';

export interface BoardAllocation {
  id: string;
  product: string;
  unit: string;
  farmer: string;
  kg: number;
  amount: number;
  status: AllocationStatus;
  expiresAt: string;
  kmToBuyer: number | null;
  farmerPhotos: string[];
  capturePhoto: string | null;
  takenKg: number | null;
  temperatureC: number | null;
  driverMediaUrl: string | null;
  driverMediaKind: MediaKind | null;
}

export interface BoardStop {
  id: string;
  kind: 'pickup' | 'dropoff';
  label: string;
  seq: number | null;
  state: 'pending' | 'done';
  doneAt: string | null;
  driver: string;
  lat: number | null;
  lng: number | null;
  allocationId: string | null;
  /** Unit of the allocation this stop collects (takenKg is a quantity in it). */
  unit: string;
  takenKg: number | null;
  temperatureC: number | null;
  mediaUrl: string | null;
  mediaKind: MediaKind | null;
}

export interface BoardDriver {
  name: string;
  lat: number | null;
  lng: number | null;
  seenAt: string | null;
}

export interface BoardOrder {
  id: string;
  code: string;
  buyer: string;
  amount: number;
  state: 'awaiting_payment' | 'paid' | 'cancelled';
  createdAt: string;
  address: string;
  itemKg: number;
  /** The one unit every line uses, or 'units' when lines mix units. */
  itemUnit: string;
  items: string[];
  allocations: BoardAllocation[];
  stops: BoardStop[];
  driver: BoardDriver | null;
}

const one = (v: any) => (Array.isArray(v) ? v[0] : v) ?? null;
const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));

const BOARD = `id, code, amount, state, created_at, delivery_address,
  buyers(organization_name),
  order_items(unit, kg, products(name)),
  order_allocations(id, listing_id, pickup_stop_id, unit, kg, amount, status, expires_at, km_to_buyer, products(name), profiles(display_name),
    produce_listings(image_paths, captures(recorded_kg, photo_path))),
  delivery_stops(id, kind, label, seq, state, done_at, lat, lng, allocation_id, driver_id,
    delivery_handovers(recorded_kg, temperature_c, note, media_path, media_kind),
    drivers(id, profiles(display_name), driver_locations(lat, lng, updated_at)))`;

const BOARD_NO_MEDIA = BOARD.replace(', media_path, media_kind', '');
const BOARD_BASE = `id, code, amount, state, created_at, delivery_address, buyers(organization_name),
  order_items(unit, kg, products(name)),
  order_allocations(id, unit, kg, amount, status, expires_at, km_to_buyer, products(name), profiles(display_name)),
  delivery_stops(id, kind, label, seq, state, done_at, drivers(profiles(display_name)))`;

async function signed(bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

function publicProduce(path: string) {
  return supabase.storage.from('produce').getPublicUrl(path).data.publicUrl;
}

function handoverOf(s: any) {
  return one(s?.delivery_handovers);
}

function locOf(drivers: any): BoardDriver {
  const d = one(drivers);
  const loc = one(d?.driver_locations);
  return {
    name: one(d?.profiles)?.display_name || '',
    lat: loc ? Number(loc.lat) : null,
    lng: loc ? Number(loc.lng) : null,
    seenAt: loc?.updated_at ?? null,
  };
}

function driverOf(stopsRaw: any[]): BoardDriver | null {
  let best: BoardDriver | null = null;
  for (const s of stopsRaw) {
    const d = locOf(s.drivers);
    if (!d.name && d.lat == null) continue;
    if (!best || (d.lat != null && best.lat == null) || (d.seenAt && (!best.seenAt || d.seenAt > best.seenAt))) best = d;
  }
  return best;
}

type BoardQuery = (cols: string) => PromiseLike<{ data: any[] | null; error: { message: string } | null; count?: number | null }>;

/** Runs a board query, falling back to thinner column sets while newer tables or columns are missing. */
async function loadBoard(run: BoardQuery): Promise<{ rows: BoardOrder[]; total: number }> {
  let res = await run(BOARD);
  if (res.error && /media_path|media_kind|delivery_handovers|produce_listings|captures|driver_locations|listing_id/i.test(res.error.message)) res = await run(BOARD_NO_MEDIA);
  if (res.error) res = await run(BOARD_BASE);
  fail('Could not load orders.')(res.error);
  return { rows: await toBoard(res.data ?? []), total: res.count ?? res.data?.length ?? 0 };
}

const cartOrders = () => supabase.from('orders');

/** Every cart order with who supplies it, driver readings, listing photos and where the truck is. */
export async function fetchBoard(): Promise<BoardOrder[]> {
  return (await loadBoard((cols) => cartOrders().select(cols).not('delivery_address', 'is', null).order('created_at', { ascending: false }).limit(100))).rows;
}

export type BoardState = 'all' | BoardOrder['state'];

/** One page of cart orders, newest first, filtered by state and order code on the server. */
export async function fetchBoardPage(page: number, q: string, state: BoardState): Promise<Paged<BoardOrder>> {
  const [from, to] = pageRange(page);
  return loadBoard((cols) => {
    let query = cartOrders().select(cols, { count: 'exact' }).not('delivery_address', 'is', null).order('created_at', { ascending: false }).range(from, to);
    if (state !== 'all') query = query.eq('state', state);
    if (q.trim()) query = query.ilike('code', likeTerm(q));
    return query;
  });
}

/** A single order for its own page, even when it is not on the current list page. */
export async function fetchBoardOrder(id: string): Promise<BoardOrder | null> {
  return (await loadBoard((cols) => cartOrders().select(cols).eq('id', id).limit(1))).rows[0] ?? null;
}

async function toBoard(data: any[]): Promise<BoardOrder[]> {
  const rows = await Promise.all(data.map(async (r: any) => {
    const stopsRaw = r.delivery_stops ?? [];
    const stops: BoardStop[] = await Promise.all(stopsRaw.map(async (s: any) => {
      const h = handoverOf(s);
      const d = locOf(s.drivers);
      const kind = h?.media_kind === 'video' ? 'video' : h?.media_kind === 'photo' ? 'photo' : null;
      return {
        id: s.id,
        kind: s.kind,
        label: s.label,
        seq: s.seq,
        state: s.state,
        doneAt: s.done_at,
        driver: d.name,
        lat: num(s.lat),
        lng: num(s.lng),
        allocationId: s.allocation_id ?? null,
        unit: (r.order_allocations ?? []).find((a: any) => a.pickup_stop_id === s.id || a.id === s.allocation_id)?.unit ?? 'kg',
        takenKg: num(h?.recorded_kg),
        temperatureC: num(h?.temperature_c),
        mediaUrl: await signed('deliveries', h?.media_path),
        mediaKind: kind as MediaKind | null,
      };
    }));
    stops.sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999));

    const byAlloc = new Map(stops.filter((s) => s.allocationId).map((s) => [s.allocationId as string, s]));
    const liveDriver = driverOf(stopsRaw);

    const allocations: BoardAllocation[] = await Promise.all((r.order_allocations ?? []).map(async (a: any) => {
      const listing = one(a.produce_listings);
      const capture = one(listing?.captures);
      // A pickup line can cover several allocations; older stops point at one allocation.
      const stop = stops.find((x) => x.id === a.pickup_stop_id) ?? byAlloc.get(a.id);
      const photos = ((listing?.image_paths ?? []) as string[]).map(publicProduce);
      return {
        id: a.id,
        product: a.products?.name ?? '',
        unit: a.unit,
        farmer: one(a.profiles)?.display_name || 'Farmer',
        kg: Number(a.kg),
        amount: Number(a.amount),
        status: a.status,
        expiresAt: a.expires_at,
        kmToBuyer: a.km_to_buyer == null ? null : Number(a.km_to_buyer),
        farmerPhotos: photos,
        capturePhoto: await signed('captures', capture?.photo_path),
        takenKg: stop?.takenKg ?? (capture ? num(capture.recorded_kg) : null),
        temperatureC: stop?.temperatureC ?? null,
        driverMediaUrl: stop?.mediaUrl ?? null,
        driverMediaKind: stop?.mediaKind ?? null,
      };
    }));

    return {
      id: r.id,
      code: r.code,
      buyer: r.buyers?.organization_name || 'Buyer',
      amount: Number(r.amount),
      state: r.state,
      createdAt: r.created_at,
      address: r.delivery_address ?? '',
      // Summed across units; only ever compared with the collected total, which is summed the same way.
      itemKg: (r.order_items ?? []).reduce((n: number, i: any) => n + Number(i.kg || 0), 0),
      itemUnit: new Set((r.order_items ?? []).map((i: any) => i.unit)).size === 1 ? r.order_items[0].unit : 'units',
      items: (r.order_items ?? []).map((i: any) => `${i.products?.name ?? 'Item'} · ${Number(i.kg).toLocaleString('en-GH')} ${i.unit}`),
      allocations,
      stops,
      driver: liveDriver,
    } satisfies BoardOrder;
  }));
  return rows;
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
  stops: { id: string; kind: 'pickup' | 'dropoff'; label: string; seq: number | null; state: 'pending' | 'done'; order: string; reading: string | null;
    lat: number; lng: number; eta: string | null; legPolyline: string | null }[];
  /** Ops set this route's order by hand; the system keeps it until the trip ends. */
  routeLocked: boolean;
  /** Positions reported in the last 12 hours, oldest first: the road actually driven. */
  trail: { lat: number; lng: number }[];
}

const readingOf = (h: any, unit = 'kg'): string | null => {
  const row = Array.isArray(h) ? h[0] : h;
  if (!row) return null;
  const parts = [
    row.recorded_kg != null ? `${Number(row.recorded_kg)} ${unit}` : '',
    row.temperature_c != null ? `${Number(row.temperature_c)}°C` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
};

export async function fetchDriverRoutes(): Promise<DriverRoute[]> {
  const drivers = supabase.from('drivers').select('id, plate_number, vehicle_type, route_locked, profiles(display_name, phone), driver_locations(lat, lng, updated_at)');
  const withReading = 'id, driver_id, kind, label, seq, state, lat, lng, eta, leg_polyline, orders(code), order_allocations!order_allocations_pickup_stop_id_fkey(unit), delivery_handovers(recorded_kg, temperature_c)';
  type StopQuery = { data: any[] | null; error: { message: string } | null };
  let stops = await supabase.from('delivery_stops').select(withReading).not('driver_id', 'is', null).order('seq', { nullsFirst: false }) as unknown as StopQuery;
  if (stops.error && /delivery_handovers|relationship|schema cache/i.test(stops.error.message)) {
    stops = await supabase.from('delivery_stops').select('id, driver_id, kind, label, seq, state, orders(code)').not('driver_id', 'is', null).order('seq', { nullsFirst: false }) as unknown as StopQuery;
  }
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const trail = await supabase.from('driver_location_trail').select('driver_id, lat, lng').gte('at', since).order('at').limit(5000);
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
      routeLocked: Boolean(r.route_locked),
      lat: loc ? Number(loc.lat) : null,
      lng: loc ? Number(loc.lng) : null,
      stops: (stops.data ?? []).filter((x: any) => x.driver_id === r.id)
        .map((x: any) => ({ id: x.id, kind: x.kind, label: x.label, seq: x.seq, state: x.state, lat: Number(x.lat), lng: Number(x.lng), eta: x.eta ?? null, legPolyline: x.leg_polyline ?? null, order: x.orders?.code ?? '', reading: readingOf(x.delivery_handovers, (Array.isArray(x.order_allocations) ? x.order_allocations[0] : x.order_allocations)?.unit) })),
      trail: (trail.data ?? []).filter((t: any) => t.driver_id === r.id).map((t: any) => ({ lat: Number(t.lat), lng: Number(t.lng) })),
    };
  });
}

export interface Decision {
  id: string;
  kind: 'no_supply' | 'no_farmer_price' | 'no_driver' | 'sms_failed' | 'allocation_error' | 'over_capacity' | 'short_supply';
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
