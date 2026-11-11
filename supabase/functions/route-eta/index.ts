// Replaces the calling driver's estimated arrival times with Google's traffic-aware drive times, and saves the
// road line of each leg for the buyer and ops maps.
// The driver's app calls this after it reports a location. The database already holds a rough estimate for every
// stop, so any failure here simply leaves that estimate in place.
import { admin, asCaller, cors, json } from '../_shared/paystack.ts';

// Google allows 25 intermediates, so one request covers the truck plus 26 stops.
const MAX_STOPS = 26;
// A fresh Google time is not worth paying for again.
const FRESH_MS = 3 * 60 * 1000;

const point = (lat: number, lng: number) => ({ location: { latLng: { latitude: Number(lat), longitude: Number(lng) } } });
/** "165s" -> 165 */
export const seconds = (d: unknown) => Number(String(d ?? '0').replace(/s$/, '')) || 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { data: who } = await asCaller(req).auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);
  const key = Deno.env.get('GOOGLE_MAPS_SERVER_KEY') ?? '';
  if (!key) return json({ updated: 0, reason: 'Maps is not configured.' });

  const db = admin();
  const driver = who.user.id;
  const [{ data: at }, { data: stops }] = await Promise.all([
    db.from('driver_locations').select('lat, lng').eq('driver_id', driver).maybeSingle(),
    db.from('delivery_stops').select('lat, lng, eta_source, eta_at').eq('driver_id', driver).eq('state', 'pending')
      .not('seq', 'is', null).order('seq').limit(MAX_STOPS),
  ]);
  if (!at || !stops?.length) return json({ updated: 0 });
  if (stops.every((s) => s.eta_source === 'google' && Date.now() - new Date(s.eta_at).getTime() < FRESH_MS)) return json({ updated: 0, reason: 'fresh' });

  const last = stops[stops.length - 1];
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'X-Goog-Api-Key': key, 'Content-Type': 'application/json', 'X-Goog-FieldMask': 'routes.legs.duration,routes.legs.polyline.encodedPolyline' },
    body: JSON.stringify({
      origin: point(at.lat, at.lng),
      destination: point(last.lat, last.lng),
      intermediates: stops.slice(0, -1).map((s) => point(s.lat, s.lng)),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
    }),
  });
  const data = await res.json().catch(() => ({}));
  const legs = data.routes?.[0]?.legs;
  if (!res.ok || !Array.isArray(legs) || legs.length !== stops.length) return json({ updated: 0, reason: 'No route from Google.' });

  const { error } = await db.rpc('set_route_etas', {
    p_driver: driver,
    p_seconds: legs.map((l: { duration?: string }) => seconds(l.duration)),
    // Road line of each leg, so maps can draw the route without asking Google again.
    p_polylines: legs.map((l: { polyline?: { encodedPolyline?: string } }) => l.polyline?.encodedPolyline ?? ''),
  });
  if (error) return json({ updated: 0, reason: 'Could not save the arrival times.' });
  return json({ updated: legs.length });
});
