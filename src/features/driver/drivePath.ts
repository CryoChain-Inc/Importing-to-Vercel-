import { useEffect, useState } from 'react';
import * as Location from 'expo-location';
import type { LatLng } from '../../components/location/liveMapTypes';

export interface DrivePath {
  /** The road to draw, through every point in order. */
  path: LatLng[];
  /** Distance and time of each leg: legs[0] is the way to the first stop. */
  legs: { meters: number; seconds: number }[];
}

const MAX_POINTS = 12;

/** Roads through the points in order, from OpenStreetMap's car profile. Null when the router is unreachable. */
export async function drivePath(points: LatLng[]): Promise<DrivePath | null> {
  const pts = points.slice(0, MAX_POINTS);
  if (pts.length < 2) return null;
  try {
    const coords = pts.map((p) => `${p.lng},${p.lat}`).join(';');
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
    );
    const route = (await res.json()).routes?.[0];
    const line = route?.geometry?.coordinates as [number, number][] | undefined;
    if (!line?.length) return null;
    return {
      path: line.map(([lng, lat]) => ({ lat, lng })),
      legs: (route.legs ?? []).map((l: any) => ({ meters: l.distance, seconds: l.duration })),
    };
  } catch {
    return null;
  }
}

export const legText = (leg?: { meters: number; seconds: number }) =>
  leg
    ? `${leg.meters < 1000 ? `${Math.round(leg.meters / 10) * 10} m` : `${(leg.meters / 1000).toFixed(1)} km`} · ${
        leg.seconds < 3600
          ? `${Math.max(1, Math.round(leg.seconds / 60))} min`
          : `${Math.floor(leg.seconds / 3600)} h ${Math.round((leg.seconds % 3600) / 60)} min`
      }`
    : '';

/** The phone's position while the screen is open. Null until permission is given and a fix arrives. */
export function useDriverPosition(): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(null);
  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let live = true;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted' || !live) return;
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 30, timeInterval: 15000 },
          (p) => live && setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        );
        if (!live) sub.remove();
      } catch {
        // No position: the map shows the stops without the truck.
      }
    })();
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return pos;
}

/** Road to every pending stop, starting from the truck when its position is known. Redrawn when a stop or ~100 m of travel changes it. */
export function useDrivePath(position: LatLng | null, stops: LatLng[]): DrivePath | null {
  const [found, setFound] = useState<{ key: string; path: DrivePath | null } | null>(null);
  const key = [
    position ? `${position.lat.toFixed(3)},${position.lng.toFixed(3)}` : '',
    ...stops.map((s) => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`),
  ].join('|');
  useEffect(() => {
    let live = true;
    const points = [...(position ? [position] : []), ...stops];
    if (points.length >= 2)
      drivePath(points).then((path) => {
        if (live) setFound({ key, path });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redrawn by key on purpose
  }, [key]);
  // A road found for an earlier set of stops is never shown for the current one.
  return found?.key === key ? found.path : null;
}
