import { supabase } from './supabase';

/** Turns a refusal from an ops action into a sentence ops can act on. */
function actionError(error: { message?: string } | null, fallback: string): Error | null {
  if (!error) return null;
  const m = error.message ?? '';
  const known: [string, string][] = [
    ['give a reason', 'Give a reason (up to 280 characters). It is kept in the order’s activity log.'],
    ['ops only', 'Only operations staff can do this.'],
    ['already collected', 'Part of this has already been collected, so it can no longer be moved or changed.'],
    ['part of this order is already collected', 'Part of this order is already on a truck, so it cannot move to another one.'],
    ['nothing to move', 'This order has no stops left to move.'],
    ['no truck', 'That driver has no truck in service. Assign one on the Fleet page first.'],
    ['route has changed', 'The route changed while you were editing it. Reload and try again.'],
    ['after its pickups', 'A delivery has to come after the pickups for that order.'],
    ['collect all produce first', 'Complete the pickups for this order first.'],
    ['no driver', 'This stop has no driver yet.'],
    ['already delivered', 'The order is delivered, so the pickup can no longer be corrected.'],
    ['not collected yet', 'This pickup has not been collected yet.'],
    ['temperature out of range', 'Enter a temperature between -100 and 100 °C.'],
  ];
  const range = m.match(/quantity must be between 0 and (\S+)/);
  if (range) return new Error(`Enter a quantity between 0 and ${Number(range[1])}.`);
  const hit = known.find(([k]) => m.includes(k));
  return new Error(hit ? hit[1] : fallback);
}
const run = async (fn: string, args: Record<string, unknown>, fallback: string) => {
  const { data, error } = await supabase.rpc(fn, args);
  const e = actionError(error, fallback);
  if (e) throw e;
  return data;
};

/** Moves an order's remaining stops to a driver, or back to waiting when `driverId` is null. Returns a capacity warning, if any. */
export const reassignOrder = (orderId: string, driverId: string | null, reason: string) =>
  run('ops_reassign_order', { p_order: orderId, p_driver: driverId, p_reason: reason }, 'Could not move the order.') as Promise<string | null>;
export const reorderStops = (driverId: string, stopIds: string[], reason: string) =>
  run('ops_reorder_stops', { p_driver: driverId, p_stops: stopIds, p_reason: reason }, 'Could not save the stop order.');
export const unlockRoute = (driverId: string, reason: string) =>
  run('ops_unlock_route', { p_driver: driverId, p_reason: reason }, 'Could not unlock the route.');
export const resourceLine = (stopId: string, reason: string) =>
  run('ops_resource_line', { p_stop: stopId, p_reason: reason }, 'Could not take this from another farm.');
export const cancelLine = (stopId: string, reason: string) =>
  run('ops_cancel_line', { p_stop: stopId, p_reason: reason }, 'Could not cancel this line.');
export const completeStop = (stopId: string, kg: number | null, celsius: number, reason: string) =>
  run('ops_complete_stop', { p_stop: stopId, p_kg: kg, p_celsius: celsius, p_reason: reason }, 'Could not complete the stop.');
export const correctPickup = (stopId: string, kg: number, reason: string) =>
  run('ops_correct_pickup', { p_stop: stopId, p_kg: kg, p_reason: reason }, 'Could not correct the quantity.');

export interface Activity {
  at: string;
  what: string;
  /** Who did it by hand; null for the system. */
  who: string | null;
  why: string | null;
}

export async function fetchActivity(orderId: string): Promise<Activity[]> {
  const { data, error } = await supabase.rpc('ops_order_activity', { p_order: orderId });
  if (error) throw new Error('Could not load the activity log.');
  return (data ?? []) as Activity[];
}

export interface Logistics {
  dispatchWaitMinutes: string;
  dispatchStart: string;
  dispatchEnd: string;
  detourKm: string;
  pickupTolerancePct: string;
  avgSpeedKmh: string;
  roadFactor: string;
  stopMinutes: string;
  etaBufferPct: string;
}

const COLS: Record<keyof Logistics, string> = {
  dispatchWaitMinutes: 'dispatch_wait_minutes', dispatchStart: 'dispatch_start', dispatchEnd: 'dispatch_end', detourKm: 'detour_km',
  pickupTolerancePct: 'pickup_tolerance_pct', avgSpeedKmh: 'avg_speed_kmh', roadFactor: 'road_factor', stopMinutes: 'stop_minutes', etaBufferPct: 'eta_buffer_pct',
};

export async function fetchLogistics(): Promise<Logistics> {
  const { data, error } = await supabase.from('ops_config').select(Object.values(COLS).join(', ')).eq('id', true).single();
  if (error || !data) throw new Error('Could not load the logistics settings.');
  const row = data as unknown as Record<string, unknown>;
  // Times come back as HH:MM:SS; the form edits HH:MM.
  return Object.fromEntries(Object.entries(COLS).map(([k, c]) => [k, String(row[c] ?? '').replace(/^(\d\d:\d\d):\d\d$/, '$1')])) as unknown as Logistics;
}

export async function saveLogistics(v: Logistics): Promise<void> {
  const row: Record<string, string | number> = {};
  for (const [k, c] of Object.entries(COLS)) {
    const raw = v[k as keyof Logistics].trim();
    row[c] = k === 'dispatchStart' || k === 'dispatchEnd' ? raw : Number(raw);
  }
  const { error } = await supabase.from('ops_config').update(row).eq('id', true);
  if (error) throw new Error('Could not save. Check each value is within its range and the start time is before the end time.');
}
