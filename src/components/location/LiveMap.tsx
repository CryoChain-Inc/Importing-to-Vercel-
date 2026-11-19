import Constants, { ExecutionEnvironment } from 'expo-constants';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SvgXml } from 'react-native-svg';
import { useTheme } from '../../theme';
import type { LatLng, LiveMapProps } from './liveMapTypes';
import { MapRecenter } from './MapRecenter';
import { lineKey, MAP_COLORS, mapStyle, placeArt, truckArt, type MarkerArt } from './mapKit';

export type { LiveMapProps, LivePlace, LatLng } from './liveMapTypes';

const PROVIDER =
  Platform.OS === 'ios' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    ? undefined
    : PROVIDER_GOOGLE;
const ACCRA = { latitude: 5.6037, longitude: -0.187 };
const MIN_SPAN = 0.05;

/** A custom marker; the native map snapshots its view, so tracking stops after first paint. Key it by its look to redraw. */
function Pin({ art, at, title, z }: { art: MarkerArt; at: LatLng; title: string; z?: number }) {
  const [track, setTrack] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setTrack(false), 600);
    return () => clearTimeout(id);
  }, []);
  return (
    <Marker
      coordinate={{ latitude: at.lat, longitude: at.lng }}
      title={title}
      zIndex={z}
      tracksViewChanges={track}
      anchor={{ x: art.ax / art.w, y: art.ay / art.h }}
    >
      <SvgXml xml={art.svg} width={art.w} height={art.h} />
    </Marker>
  );
}

const coords = (p: LatLng[]) => p.map((x) => ({ latitude: x.lat, longitude: x.lng }));

export const warmMap = () => undefined;

/** A read-only map of a truck, the places it serves, the road ahead and (for ops) the road already driven. */
export function LiveMap({
  truck,
  truckName,
  places = [],
  route = [],
  trail = [],
  height = 280,
}: LiveMapProps) {
  const map = useRef<MapView>(null);
  const dark = useTheme().mode === 'dark';
  const k = MAP_COLORS[dark ? 'dark' : 'light'];
  const all = [...(truck ? [truck] : []), ...places, ...route];
  const points = useRef(all);
  useEffect(() => {
    points.current = all;
  });
  // Converted only when the line's shape changes, so the native lines aren't re-sent on every poll.
  const aheadKey = lineKey(route);
  const drivenKey = lineKey(trail);
  /* eslint-disable react-hooks/exhaustive-deps -- keyed by line shape on purpose */
  const roadAhead = useMemo(() => coords(route), [aheadKey]);
  const roadDriven = useMemo(() => coords(trail), [drivenKey]);
  /* eslint-enable react-hooks/exhaustive-deps */
  // Re-frame only when what is shown changes, not on every small truck move.
  const frameKey = [
    places.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join('|'),
    route.length > 0,
    !!truck,
  ].join('#');

  const fit = () => {
    const pts = points.current;
    if (pts.length === 0) return;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const [south, north] = [Math.min(...lats), Math.max(...lats)];
    const [west, east] = [Math.min(...lngs), Math.max(...lngs)];
    // Never closer than ~5 km across, so a lone truck or two nearby stops still shows the surroundings.
    map.current?.animateToRegion(
      {
        latitude: (south + north) / 2,
        longitude: (west + east) / 2,
        latitudeDelta: Math.max((north - south) * 1.5, MIN_SPAN),
        longitudeDelta: Math.max((east - west) * 1.5, MIN_SPAN),
      },
      350,
    );
  };

  useEffect(() => {
    fit();
  }, [frameKey]);

  return (
    <View style={[s.wrap, { height }]}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER}
        toolbarEnabled={false}
        customMapStyle={mapStyle(dark)}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsIndoors={false}
        showsCompass={false}
        initialRegion={{
          ...(truck ? { latitude: truck.lat, longitude: truck.lng } : ACCRA),
          latitudeDelta: 0.2,
          longitudeDelta: 0.2,
        }}
      >
        {roadDriven.length > 1 ? (
          <Polyline coordinates={roadDriven} strokeColor={k.trail} strokeWidth={4} zIndex={1} />
        ) : null}
        {roadAhead.length > 1 ? (
          <Polyline coordinates={roadAhead} strokeColor={k.casing} strokeWidth={9} zIndex={2} />
        ) : null}
        {roadAhead.length > 1 ? (
          <Polyline
            coordinates={roadAhead}
            strokeColor={k.route}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
            zIndex={3}
          />
        ) : null}
        {places.map((p, i) => (
          <Pin
            key={`${p.lat},${p.lng},${i},${p.kind},${p.label},${dark}`}
            art={placeArt(p, dark)}
            at={p}
            title={p.label}
            z={4}
          />
        ))}
        {truck ? (
          <Pin
            key={`truck,${truckName},${dark}`}
            art={truckArt(truckName, dark)}
            at={truck}
            title={truckName ? `${truckName}'s truck` : 'Truck'}
            z={10}
          />
        ) : null}
      </MapView>
      <MapRecenter onPress={fit} />
    </View>
  );
}

const s = StyleSheet.create({ wrap: { width: '100%', borderRadius: 16, overflow: 'hidden' } });
