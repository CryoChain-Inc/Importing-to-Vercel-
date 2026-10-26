/** Driving route along roads. OpenStreetMap's car profile, used when Google Directions is unavailable. */
export async function roadRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<{ lat: number; lng: number }[]> {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=false`);
    const body = await res.json();
    const coords = body.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
    return (coords ?? []).map(([lng, lat]) => ({ lat, lng }));
  } catch {
    return [];
  }
}
