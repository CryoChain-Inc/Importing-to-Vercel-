import { supabase } from './supabase';

export interface Truck {
  id: string;
  plate: string;
  name: string;
  capacityKg: number;
  driverId: string | null;
  driverName: string;
  active: boolean;
}

export const cleanPlate = (plate: string) => plate.trim().toUpperCase();

export async function fetchTrucks(): Promise<Truck[]> {
  const { data, error } = await supabase
    .from('trucks')
    .select('id, plate, name, capacity_kg, driver_id, active, drivers(profiles(display_name))')
    .order('active', { ascending: false })
    .order('plate');
  if (error) throw new Error('Could not load the trucks.');
  return (data ?? []).map((r: any) => ({
    id: r.id,
    plate: r.plate,
    name: r.name ?? '',
    capacityKg: Number(r.capacity_kg),
    driverId: r.driver_id,
    driverName: r.drivers?.profiles?.display_name ?? '',
    active: r.active,
  }));
}

/** Adds a truck, or updates the one with `id`. A retired truck is also taken off its driver. */
export async function saveTruck(t: { id?: string; plate: string; name: string; capacityKg: number; driverId: string | null; active: boolean }): Promise<void> {
  const row = { plate: cleanPlate(t.plate), name: t.name.trim(), capacity_kg: t.capacityKg, driver_id: t.active ? t.driverId : null, active: t.active };
  const { error } = t.id ? await supabase.from('trucks').update(row).eq('id', t.id) : await supabase.from('trucks').insert(row);
  if (!error) return;
  const msg = error.message ?? '';
  if (msg.includes('trucks_plate_key')) throw new Error(`A truck with plate ${row.plate} already exists.`);
  if (msg.includes('trucks_driver_key')) throw new Error('That driver already has a truck. Unassign it first.');
  throw new Error('Could not save the truck.');
}
