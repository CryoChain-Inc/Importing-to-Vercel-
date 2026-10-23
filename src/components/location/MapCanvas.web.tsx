import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../../theme';
import type { MapTarget } from './MapCanvas';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;

let loader: Promise<any> | null = null;
/** Loads the Maps JavaScript API once per page. */
const loadMaps = () =>
  (loader ??= new Promise((resolve, reject) => {
    const w = window as any;
    if (w.google?.maps?.Map) return resolve(w.google.maps);
    // `callback` fires once the API is fully ready, so no importLibrary (absent when a blocker stubs the loader).
    w.__mapsReady = () => resolve(w.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&v=weekly&callback=__mapsReady`;
    s.async = true;
    s.onerror = () => {
      loader = null;
      reject(new Error('Could not load the map.'));
    };
    document.head.appendChild(s);
  }));

/** Web map (Maps JavaScript API). Same contract as the native MapCanvas. */
export function MapCanvas({ target, onSettle }: { target: MapTarget; onSettle: (latitude: number, longitude: number) => void }) {
  const host = useRef<View>(null);
  const map = useRef<any>(null);
  const settle = useRef(onSettle);
  useEffect(() => {
    settle.current = onSettle;
  });
  const [error, setError] = useState<string | null>(KEY ? null : 'Map key missing.');

  useEffect(() => {
    if (!KEY) return;
    let dead = false;
    loadMaps()
      .then((maps) => {
        if (dead || !host.current) return;
        const m = new maps.Map(host.current as unknown as HTMLElement, {
          center: { lat: target.latitude, lng: target.longitude },
          zoom: 17,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        m.addListener('idle', () => {
          const c = m.getCenter();
          settle.current(c.lat(), c.lng());
        });
        map.current = m;
      })
      .catch((e: Error) => !dead && setError(e.message));
    return () => {
      dead = true;
    };
    // The map is created once; later moves go through the target effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    map.current?.panTo({ lat: target.latitude, lng: target.longitude });
  }, [target.n, target.latitude, target.longitude]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View ref={host} style={StyleSheet.absoluteFill} />
      {error ? <Text style={{ padding: 16, fontFamily: fonts.sansMedium }}>{error}</Text> : null}
    </View>
  );
}
