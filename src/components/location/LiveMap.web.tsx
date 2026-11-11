import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { loadScript, TRUCK_H, TRUCK_URL, TRUCK_W } from '../../features/buyer/components/TripMap';
import type { LiveMapProps } from './liveMapTypes';

export type { LiveMapProps, LivePlace, LatLng } from './liveMapTypes';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
const ACCRA = { lat: 5.6037, lng: -0.187 };
const PIN = { pickup: '#d98b1f', dropoff: '#2E7D4F', done: '#9aa5a0' } as const;

/** Web version: Google Maps when a key is set, OpenStreetMap otherwise. */
export function LiveMap({ truck, places = [], route = [], trail = [], height = 280 }: LiveMapProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const engine = useRef<{ kind: 'google'; map: any; g: any } | { kind: 'leaflet'; map: any; L: any } | null>(null);
  const layers = useRef<any[]>([]);
  const framed = useRef('');
  const [ready, setReady] = useState(false);

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
      const map = L.map(el).setView([ACCRA.lat, ACCRA.lng], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      engine.current = { kind: 'leaflet', map, L };
      setReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    };
    const start = async () => {
      if (!KEY) return leaflet();
      await loadScript('google-maps-js', `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}`);
      if (dead) return;
      const g = (window as unknown as { google: any }).google;
      const map = new g.maps.Map(el, { center: ACCRA, zoom: 11, disableDefaultUI: true, zoomControl: true, clickableIcons: false });
      engine.current = { kind: 'google', map, g };
      setReady(true);
    };
    start().catch(() => leaflet().catch(() => undefined));
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    const clear = (l: any) => (e.kind === 'google' ? l.setMap(null) : e.map.removeLayer(l));
    layers.current.forEach(clear);
    layers.current = [];
    const all = [...(truck ? [truck] : []), ...places, ...route];
    const key = [places.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join('|'), route.length > 0, !!truck].join('#');
    if (e.kind === 'google') {
      const { g, map } = e;
      const line = (path: typeof route, color: string, weight: number) =>
        path.length > 1 && layers.current.push(new g.maps.Polyline({ path, map, strokeColor: color, strokeWeight: weight }));
      line(trail, '#9aa5a0', 4);
      line(route, '#2f6fe0', 5);
      places.forEach((p) => layers.current.push(new g.maps.Marker({
        position: p, map, title: p.label,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: PIN[p.kind], fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      })));
      if (truck) {
        layers.current.push(new g.maps.Marker({
          position: truck, map, title: 'Truck', zIndex: 5,
          icon: { url: TRUCK_URL, scaledSize: new g.maps.Size(TRUCK_W, TRUCK_H), anchor: new g.maps.Point(TRUCK_W / 2, TRUCK_H / 2) },
        }));
      }
      if (all.length && framed.current !== key) {
        const b = new g.maps.LatLngBounds();
        all.forEach((p) => b.extend(p));
        map.fitBounds(b, 48);
      }
    } else {
      const { L, map } = e;
      const line = (path: typeof route, color: string, weight: number) =>
        path.length > 1 && layers.current.push(L.polyline(path.map((p) => [p.lat, p.lng]), { color, weight }).addTo(map));
      line(trail, '#9aa5a0', 4);
      line(route, '#2f6fe0', 5);
      places.forEach((p) => layers.current.push(L.circleMarker([p.lat, p.lng], { radius: 8, color: '#fff', weight: 2, fillColor: PIN[p.kind], fillOpacity: 1 }).bindTooltip(p.label).addTo(map)));
      if (truck) {
        const icon = L.icon({ iconUrl: TRUCK_URL, iconSize: [TRUCK_W, TRUCK_H], iconAnchor: [TRUCK_W / 2, TRUCK_H / 2] });
        layers.current.push(L.marker([truck.lat, truck.lng], { icon, title: 'Truck', zIndexOffset: 500 }).addTo(map));
      }
      if (all.length && framed.current !== key) map.fitBounds(L.latLngBounds(all.map((p) => [p.lat, p.lng])), { padding: [32, 32] });
    }
    framed.current = key;
  }, [ready, truck, places, route, trail]);

  return (
    <View>
      {React.createElement('div', { ref: host, style: { height, width: '100%', borderRadius: 16, overflow: 'hidden', background: '#e7efe9' } })}
    </View>
  );
}
