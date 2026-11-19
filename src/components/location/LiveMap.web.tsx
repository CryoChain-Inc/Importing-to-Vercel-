import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { loadScript } from '../../features/buyer/components/TripMap';
import { useTheme } from '../../theme';
import type { LiveMapProps } from './liveMapTypes';
import { MapRecenter } from './MapRecenter';
import {
  artUrl,
  lineKey,
  MAP_COLORS,
  mapStyle,
  placeArt,
  tileUrl,
  truckArt,
  type MarkerArt,
} from './mapKit';

export type { LiveMapProps, LivePlace, LatLng } from './liveMapTypes';

// Street level loads many more tiles and shows less context than a trip needs.
const MAX_FIT_ZOOM = 16;
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
const ACCRA = { lat: 5.6037, lng: -0.187 };

/** Start downloading the map library early (e.g. when the orders list opens) so the map is ready when a card needs it. */
export function warmMap() {
  if (KEY)
    loadScript(
      'google-maps-js',
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}`,
    ).catch(() => undefined);
}

/** Web version: Google Maps when a key is set, OpenStreetMap otherwise. */
export function LiveMap({
  truck,
  truckName,
  places = [],
  route = [],
  trail = [],
  height = 280,
}: LiveMapProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const dark = useTheme().mode === 'dark';
  const k = MAP_COLORS[dark ? 'dark' : 'light'];
  const engine = useRef<
    { kind: 'google'; map: any; g: any } | { kind: 'leaflet'; map: any; L: any; tiles: any } | null
  >(null);
  const layers = useRef<any[]>([]);
  const truckPin = useRef<{ marker: any; art: MarkerArt } | null>(null);
  const points = useRef<{ lat: number; lng: number }[]>([]);
  const [ready, setReady] = useState(false);
  // Open already centred on the truck (or first place) so the map doesn't load on Accra and then jump.
  const first = useRef(truck ?? places[0] ?? ACCRA);

  useEffect(() => {
    const el = host.current;
    if (!el || engine.current) return;
    let dead = false;
    const leaflet = async () => {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      await loadScript('leaflet-js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
      if (dead) return;
      const L = (window as unknown as { L: any }).L;
      el.replaceChildren();
      const map = L.map(el).setView([first.current.lat, first.current.lng], 13);
      const tiles = L.tileLayer(tileUrl(dark), {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      }).addTo(map);
      engine.current = { kind: 'leaflet', map, L, tiles };
      setReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    };
    const start = async () => {
      if (!KEY) return leaflet();
      await loadScript(
        'google-maps-js',
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}`,
      );
      if (dead) return;
      const g = (window as unknown as { google: any }).google;
      const map = new g.maps.Map(el, {
        center: first.current,
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: g.maps.ControlPosition.RIGHT_TOP },
        clickableIcons: false,
        styles: mapStyle(dark),
      });
      engine.current = { kind: 'google', map, g };
      setReady(true);
    };
    start().catch(() => leaflet().catch(() => undefined));
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- built once; the effect below applies theme changes
  }, []);

  // Everything the view should frame; read by the recenter button and the auto-fit below.
  const all = [...(truck ? [truck] : []), ...places, ...route];
  useEffect(() => {
    points.current = all;
  });
  const sceneKey = [
    dark,
    places.map((p) => `${p.kind}${p.label}${p.lat},${p.lng}`).join('|'),
    lineKey(route),
    lineKey(trail),
  ].join('#');
  // Re-frame only when what is shown changes, not on every small truck move.
  const frameKey = [
    places.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join('|'),
    route.length > 0,
    !!truck,
  ].join('#');

  const fit = () => {
    const e = engine.current;
    const all = points.current;
    if (!e || !all.length) return;
    if (e.kind === 'google') {
      const b = new e.g.maps.LatLngBounds();
      all.forEach((p) => b.extend(p));
      e.map.fitBounds(b, 56);
      e.g.maps.event.addListenerOnce(e.map, 'idle', () => {
        if ((e.map.getZoom() ?? 0) > MAX_FIT_ZOOM) e.map.setZoom(MAX_FIT_ZOOM);
      });
    } else {
      e.map.fitBounds(e.L.latLngBounds(all.map((p) => [p.lat, p.lng])), {
        padding: [40, 40],
        maxZoom: MAX_FIT_ZOOM,
      });
    }
  };

  // Theme: restyling a Google map repaints every tile, so only do it when the theme flips.
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    if (e.kind === 'google') e.map.setOptions({ styles: mapStyle(dark) });
    else e.tiles.setUrl(tileUrl(dark));
  }, [ready, dark]);

  // Roads and places: redrawn only when their content changes, not on every poll or parent render.
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const clear = (l: any) => (e.kind === 'google' ? l.setMap(null) : e.map.removeLayer(l));
    layers.current.forEach(clear);
    layers.current = [];
    if (e.kind === 'google') {
      const { g, map } = e;
      const line = (path: typeof route, color: string, weight: number, z: number) =>
        path.length > 1 &&
        layers.current.push(
          new g.maps.Polyline({
            path,
            map,
            strokeColor: color,
            strokeOpacity: 1,
            strokeWeight: weight,
            zIndex: z,
            clickable: false,
          }),
        );
      line(trail, k.trail, 4, 1);
      line(route, k.casing, 9, 2);
      line(route, k.route, 5, 3);
      places.forEach((p) => {
        const a = placeArt(p, dark);
        layers.current.push(
          new g.maps.Marker({
            position: p,
            map,
            title: p.label,
            zIndex: 4,
            optimized: true,
            icon: {
              url: artUrl(a),
              scaledSize: new g.maps.Size(a.w, a.h),
              anchor: new g.maps.Point(a.ax, a.ay),
            },
          }),
        );
      });
    } else {
      const { L, map } = e;
      const line = (path: typeof route, color: string, weight: number) =>
        path.length > 1 &&
        layers.current.push(
          L.polyline(
            path.map((p) => [p.lat, p.lng]),
            { color, weight, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false },
          ).addTo(map),
        );
      line(trail, k.trail, 4);
      line(route, k.casing, 9);
      line(route, k.route, 5);
      places.forEach((p) => {
        const a = placeArt(p, dark);
        layers.current.push(
          L.marker([p.lat, p.lng], {
            title: p.label,
            icon: L.icon({ iconUrl: artUrl(a), iconSize: [a.w, a.h], iconAnchor: [a.ax, a.ay] }),
          }).addTo(map),
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by sceneKey on purpose
  }, [ready, sceneKey]);

  // The truck: moved in place as it drives; its marker is only rebuilt when its look changes.
  const art = truck ? truckArt(truckName, dark) : null;
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const old = truckPin.current;
    if (old && (!truck || old.art !== art)) {
      if (e.kind === 'google') old.marker.setMap(null);
      else e.map.removeLayer(old.marker);
      truckPin.current = null;
    }
    if (!truck || !art) return;
    if (truckPin.current) {
      if (e.kind === 'google') truckPin.current.marker.setPosition(truck);
      else truckPin.current.marker.setLatLng([truck.lat, truck.lng]);
      return;
    }
    const title = truckName ? `${truckName}'s truck` : 'Truck';
    const marker =
      e.kind === 'google'
        ? new e.g.maps.Marker({
            position: truck,
            map: e.map,
            title,
            zIndex: 10,
            icon: {
              url: artUrl(art),
              scaledSize: new e.g.maps.Size(art.w, art.h),
              anchor: new e.g.maps.Point(art.ax, art.ay),
            },
          })
        : e.L.marker([truck.lat, truck.lng], {
            title,
            zIndexOffset: 500,
            icon: e.L.icon({
              iconUrl: artUrl(art),
              iconSize: [art.w, art.h],
              iconAnchor: [art.ax, art.ay],
            }),
          }).addTo(e.map);
    truckPin.current = { marker, art };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the truck's coordinates, not the object
  }, [ready, truck?.lat, truck?.lng, art]);

  useEffect(() => {
    fit();
  }, [ready, frameKey]);

  return (
    <View style={{ height }}>
      {React.createElement('div', {
        ref: host,
        style: {
          height,
          width: '100%',
          borderRadius: 16,
          overflow: 'hidden',
          background: dark ? '#141d18' : '#eef3ea',
        },
      })}
      {ready ? <MapRecenter onPress={fit} /> : null}
    </View>
  );
}
