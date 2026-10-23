import type { Place } from '../../../services/truck.service';

const key = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
let googleOff = false;

/** Google rejected this key, so search and the map stay on OpenStreetMap. */
export async function googleKeyAccepted(candidate = key): Promise<boolean> {
  if (!candidate || googleOff) return false;
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Accra&key=${encodeURIComponent(candidate)}`);
    const body = await res.json();
    if (body.status === 'REQUEST_DENIED') {
      googleOff = true;
      return false;
    }
    return body.status === 'OK' || body.status === 'ZERO_RESULTS';
  } catch {
    return false;
  }
}

/** Turns a search into places. Uses Google when the key is accepted, otherwise OpenStreetMap. */
export async function searchPlaces(query: string): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  if (key && !googleOff) {
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:GH&key=${encodeURIComponent(key)}`);
      const body = await res.json();
      if (body.status === 'REQUEST_DENIED') googleOff = true;
      else if (body.results?.length) {
        return body.results.slice(0, 5).map((r: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }) => ({
          label: r.formatted_address.slice(0, 160),
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
        }));
      }
    } catch {
      // The OpenStreetMap search below still runs.
    }
  }
  // Photon allows browser requests and is biased toward Accra, then kept to Ghana when those results exist.
  const res = await fetch(`https://photon.komoot.io/api/?limit=8&lat=5.6037&lon=-0.187&q=${encodeURIComponent(q)}`);
  const body = await res.json();
  const rows = (body.features ?? []) as PhotonFeature[];
  const ghana = rows.filter((r) => r.properties?.countrycode === 'GH');
  return (ghana.length ? ghana : rows).slice(0, 5).map(photonPlace);
}

export async function labelFor(lat: number, lng: number): Promise<string> {
  try {
    if (key && !googleOff) {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(key)}`);
      const body = await res.json();
      if (body.status === 'REQUEST_DENIED') googleOff = true;
      else if (body.results?.[0]?.formatted_address) return body.results[0].formatted_address.slice(0, 160);
    }
    const res = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`);
    const body = await res.json();
    const feature = (body.features ?? [])[0] as PhotonFeature | undefined;
    return feature ? photonPlace(feature).label : 'Pinned on the map';
  } catch {
    return 'Pinned on the map';
  }
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { name?: string; street?: string; city?: string; state?: string; country?: string; countrycode?: string };
}

function photonPlace(feature: PhotonFeature): Place {
  const [lng, lat] = feature.geometry?.coordinates ?? [0, 0];
  const p = feature.properties ?? {};
  const label = [p.name, p.street, p.city, p.state, p.country].filter((part, i, all) => part && all.indexOf(part) === i).join(', ');
  return { label: (label || 'Pinned on the map').slice(0, 160), lat, lng };
}
