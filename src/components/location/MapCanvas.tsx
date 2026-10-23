import Constants, { ExecutionEnvironment } from 'expo-constants';
import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';

// Expo Go on iOS has no Google Maps SDK, so it falls back to Apple Maps; dev/production builds use Google tiles.
const PROVIDER = Platform.OS === 'ios' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? undefined : PROVIDER_GOOGLE;

export interface MapTarget {
  latitude: number;
  longitude: number;
  /** Bumped on every request so moving to the same spot twice still pans. */
  n: number;
}

/** Native map (Google tiles). The pin is drawn by the parent over the centre; onSettle fires when the map stops moving. */
export function MapCanvas({ target, onSettle }: { target: MapTarget; onSettle: (latitude: number, longitude: number) => void }) {
  const map = useRef<MapView>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    map.current?.animateToRegion({ latitude: target.latitude, longitude: target.longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 350);
  }, [target.n, target.latitude, target.longitude]);

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER}
      initialRegion={{ latitude: target.latitude, longitude: target.longitude, latitudeDelta: 0.004, longitudeDelta: 0.004 }}
      onMapReady={() => onSettle(target.latitude, target.longitude)}
      onRegionChangeComplete={(r: Region) => onSettle(r.latitude, r.longitude)}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      moveOnMarkerPress={false}
    />
  );
}
