import Constants, { ExecutionEnvironment } from 'expo-constants';
import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { LiveMapProps } from './liveMapTypes';

export type { LiveMapProps, LivePlace, LatLng } from './liveMapTypes';

const PROVIDER = Platform.OS === 'ios' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? undefined : PROVIDER_GOOGLE;
const ACCRA = { latitude: 5.6037, longitude: -0.187 };
const PIN = { pickup: '#d98b1f', dropoff: '#2E7D4F', done: '#9aa5a0' } as const;

export const warmMap = () => undefined;

/** A read-only map of a truck, the places it serves, the road ahead and (for ops) the road already driven. */
export function LiveMap({ truck, places = [], route = [], trail = [], height = 280 }: LiveMapProps) {
  const map = useRef<MapView>(null);
  const all = [...(truck ? [truck] : []), ...places, ...route];
  // Re-frame only when what is shown changes, not on every small truck move.
  const frameKey = [places.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join('|'), route.length > 0, !!truck].join('#');

  useEffect(() => {
    if (all.length === 0) return;
    map.current?.fitToCoordinates(all.map((p) => ({ latitude: p.lat, longitude: p.lng })), {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 }, animated: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- framed by frameKey on purpose
  }, [frameKey]);

  return (
    <View style={[s.wrap, { height }]}>
      <MapView ref={map} style={StyleSheet.absoluteFill} provider={PROVIDER} toolbarEnabled={false}
        initialRegion={{ ...(truck ? { latitude: truck.lat, longitude: truck.lng } : ACCRA), latitudeDelta: 0.2, longitudeDelta: 0.2 }}>
        {trail.length > 1 ? <Polyline coordinates={trail.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor="#9aa5a0" strokeWidth={4} /> : null}
        {route.length > 1 ? <Polyline coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor="#2f6fe0" strokeWidth={5} /> : null}
        {places.map((p, i) => (
          <Marker key={`${p.lat},${p.lng},${i}`} coordinate={{ latitude: p.lat, longitude: p.lng }} title={p.label} pinColor={PIN[p.kind]} />
        ))}
        {truck ? <Marker coordinate={{ latitude: truck.lat, longitude: truck.lng }} title="Truck" pinColor="#2a6fdb" /> : null}
      </MapView>
    </View>
  );
}

const s = StyleSheet.create({ wrap: { width: '100%', borderRadius: 16, overflow: 'hidden' } });
