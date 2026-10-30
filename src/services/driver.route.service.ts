import { supabase } from './supabase';

export interface RouteStop {
  id: string;
  kind: 'pickup' | 'dropoff';
  label: string;
  order: string;
  lat: number;
  lng: number;
  state: 'pending' | 'done';
}

/** This driver's stops in driving order: pending first (sequenced by the system), then what is done. */
export async function fetchMyRoute(): Promise<RouteStop[]> {
  const { data, error } = await supabase
    .from('delivery_stops')
    .select('id, kind, label, lat, lng, state, seq, done_at, orders(code)')
    .order('seq', { nullsFirst: false });
  if (error) throw new Error('Could not load your route.');
  const rows = (data ?? []).map((r: any) => ({ id: r.id, kind: r.kind, label: r.label, order: r.orders?.code ?? '', lat: Number(r.lat), lng: Number(r.lng), state: r.state }));
  return [...rows.filter((r) => r.state === 'pending'), ...rows.filter((r) => r.state === 'done').slice(-5)];
}

export async function completeStop(id: string): Promise<void> {
  const { error } = await supabase.rpc('complete_delivery_stop', { p_stop: id });
  if (error?.message.includes('collect all produce first')) throw new Error('Collect all the produce for this order before delivering it.');
  if (error?.message.includes('record the pickup first')) throw new Error('Save the kilos, grade and temperature before marking this pickup collected.');
  if (error?.message.includes('log the temperature')) throw new Error('Save the temperature before marking this delivery done.');
  if (error?.message.includes('no longer be changed')) throw new Error('This stop is already done, so it can no longer be changed.');
  if (error) throw new Error('Could not mark that stop done. Please try again.');
}

export async function pingLocation(lat: number, lng: number): Promise<void> {
  const { error } = await supabase.rpc('report_driver_location', { p_lat: lat, p_lng: lng });
  if (error) throw new Error('Could not share your location.');
}
