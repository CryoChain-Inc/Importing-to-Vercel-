// Google Places and Geocoding behind a signed-in check, so the server key never ships in the app.
// Actions: autocomplete {query, latitude?, longitude?}, place {placeId}, reverse {latitude, longitude}.
import { asCaller, cors, json } from '../_shared/paystack.ts';

interface Component { longText?: string; long_name?: string; types: string[] }

const KEY = () => Deno.env.get('GOOGLE_MAPS_SERVER_KEY') ?? '';
const part = (cs: Component[], ...types: string[]) => {
  for (const t of types) {
    const c = cs.find((x) => x.types.includes(t));
    if (c) return c.longText ?? c.long_name ?? '';
  }
  return '';
};
const shape = (formatted: string, cs: Component[], latitude: number, longitude: number) => ({
  address: formatted,
  city: part(cs, 'locality', 'postal_town', 'administrative_area_level_2', 'sublocality_level_1'),
  postcode: part(cs, 'postal_code'),
  latitude,
  longitude,
});
const inRange = (lat: unknown, lng: unknown) =>
  typeof lat === 'number' && typeof lng === 'number' && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { data: who } = await asCaller(req).auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);
  if (!KEY()) return json({ error: 'Maps is not configured.' }, 500);

  const body = await req.json().catch(() => ({}));
  const headers = { 'X-Goog-Api-Key': KEY(), 'Content-Type': 'application/json' };

  if (body.action === 'autocomplete') {
    const input = String(body.query ?? '').trim().slice(0, 120);
    if (input.length < 2) return json({ suggestions: [] });
    const bias = inRange(body.latitude, body.longitude)
      ? { locationBias: { circle: { center: { latitude: body.latitude, longitude: body.longitude }, radius: 50000 } } }
      : {};
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ input, ...bias }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: 'Search failed. Try again.' }, 502);
    const suggestions = (data.suggestions ?? [])
      .filter((s: any) => s.placePrediction)
      .map((s: any) => ({
        placeId: s.placePrediction.placeId,
        title: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? '',
        subtitle: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
      }));
    return json({ suggestions });
  }

  if (body.action === 'place') {
    const id = String(body.placeId ?? '');
    if (!/^[\w-]{10,200}$/.test(id)) return json({ error: 'Invalid place.' }, 400);
    const res = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
      headers: { ...headers, 'X-Goog-FieldMask': 'location,formattedAddress,addressComponents' },
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.location) return json({ error: 'Could not load that place.' }, 502);
    return json(shape(d.formattedAddress ?? '', d.addressComponents ?? [], d.location.latitude, d.location.longitude));
  }

  if (body.action === 'reverse') {
    if (!inRange(body.latitude, body.longitude)) return json({ error: 'Invalid location.' }, 400);
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${body.latitude},${body.longitude}&key=${KEY()}`,
    );
    const d = await res.json().catch(() => ({}));
    const hit = d.results?.[0];
    if (!hit) return json({ error: 'No address found at this spot.' }, 200);
    return json(shape(hit.formatted_address, hit.address_components ?? [], body.latitude, body.longitude));
  }

  return json({ error: 'Unknown action.' }, 400);
});
