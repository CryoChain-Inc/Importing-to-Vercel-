import { supabase } from './supabase';

export interface DriverStop {
  id: string;
  pointName: string;
  locality: string;
  product: string;
  farmers: number;
  listedKg: number;
  captured: number;
  confirmed: boolean;
  arrivedAt: string | null;
  temperatureC: number | null;
  departedAt: string | null;
}

export interface DriverRoute {
  id: string;
  destination: string;
  plate: string;
  deliveredAt: string | null;
  receivedBy: string;
  stops: DriverStop[];
}

const explain = (error: { message?: string } | null, fallback: string) => {
  const msg = error?.message ?? '';
  if (/log the temperature/.test(msg)) throw new Error('Log the temperature before leaving.');
  if (/lot not ready/.test(msg)) throw new Error('The agent must capture every farmer and confirm this lot before you can leave.');
  if (/arrive first/.test(msg)) throw new Error('Confirm your arrival before logging the temperature.');
  if (/temperature out of range/.test(msg)) throw new Error('That temperature is outside the allowed range.');
  if (/enter the receiver/.test(msg)) throw new Error('Enter the name of the person receiving the load.');
  if (/take a photograph/.test(msg)) throw new Error('Take a photograph of the delivered load.');
  if (/finish every stop/.test(msg)) throw new Error('Leave every stop before completing the delivery.');
  throw new Error(fallback);
};

export async function fetchDriverRoute(): Promise<DriverRoute | null> {
  const { data, error } = await supabase.rpc('driver_today');
  if (error) throw new Error('Could not load today\'s route.');
  if (!data) return null;
  const row = data as DriverRoute;
  return {
    ...row,
    destination: row.destination ?? '',
    plate: row.plate ?? '',
    receivedBy: row.receivedBy ?? '',
    stops: (row.stops ?? []).map((stop) => ({
      ...stop,
      farmers: Number(stop.farmers),
      listedKg: Number(stop.listedKg),
      captured: Number(stop.captured),
      temperatureC: stop.temperatureC == null ? null : Number(stop.temperatureC),
    })),
  };
}

async function call(fn: string, args: Record<string, unknown>, fallback: string) {
  const { error } = await supabase.rpc(fn, args);
  if (error) explain(error, fallback);
}

export const arriveStop = (stopId: string) => call('arrive_stop', { p_stop_id: stopId }, 'Could not record your arrival.');

export const logTemperature = (stopId: string, celsius: number) =>
  call('log_stop_temperature', { p_stop_id: stopId, p_celsius: celsius }, 'Could not log the temperature.');

export const departStop = (stopId: string) => call('depart_stop', { p_stop_id: stopId }, 'Could not confirm that you are leaving.');

export async function completeDelivery(routeId: string, receiver: string, photo: { uri: string; mime: string }): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Sign in again to continue.');
  const path = `${userData.user.id}/${routeId}.jpg`;
  const blob = await (await fetch(photo.uri)).blob();
  const uploaded = await supabase.storage.from('deliveries').upload(path, blob, {
    upsert: true,
    contentType: photo.mime || 'image/jpeg',
  });
  if (uploaded.error) throw new Error('Could not save the photograph.');
  await call('complete_delivery', { p_route_id: routeId, p_receiver: receiver.trim(), p_photo_path: path }, 'Could not complete the delivery.');
}
