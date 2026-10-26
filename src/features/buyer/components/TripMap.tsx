import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Button } from '../../../components/common';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Place } from '../../../services/truck.service';
import { googleKeyAccepted, labelFor } from './places';
import { roadRoute } from './route';

const ACCRA = { lat: 5.6037, lng: -0.187 };
const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;

function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const found = document.getElementById(id) as HTMLScriptElement | null;
    if (found?.dataset.ready === '1') return resolve();
    if (found) {
      found.addEventListener('load', () => resolve());
      found.addEventListener('error', () => reject(new Error('map')));
      return;
    }
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.ready = '1';
      resolve();
    };
    script.onerror = () => reject(new Error('map'));
    document.body.appendChild(script);
  });
}

const ROUTE = '#2f6fe0';
/** CSS centimetres: 1cm = 96px / 2.54. The truck is 2cm long and 1cm tall. */
const TRUCK_W = 2 * (96 / 2.54);
const TRUCK_H = 1 * (96 / 2.54);
const TRUCK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  <rect x="1" y="3" width="22" height="11" rx="1.2" fill="#f7fbff" stroke="#2a6fdb" stroke-width="1.2"/>
  <path d="M12 6.2v4.6M9.8 8.5h4.4M10.4 6.8l3.2 3.4M13.6 6.8l-3.2 3.4" stroke="#2a6fdb" stroke-width="0.8" fill="none" stroke-linecap="round"/>
  <path d="M23 6.5h6.2c.8 0 1.5.4 1.9 1.1L33.5 12H23V6.5z" fill="#24508f"/>
  <path d="M27.2 7.4h2.2l1.6 2.4h-3.8V7.4z" fill="#d6e8ff"/>
  <circle cx="8" cy="15.2" r="2.1" fill="#1b2430"/>
  <circle cx="8" cy="15.2" r="0.8" fill="#d5dde6"/>
  <circle cx="29" cy="15.2" r="2.1" fill="#1b2430"/>
  <circle cx="29" cy="15.2" r="0.8" fill="#d5dde6"/>
</svg>`;
const TRUCK_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(TRUCK_SVG)}`;

function googleDrivingPath(google: any, from: Place, to: Place): Promise<{ lat: number; lng: number }[]> {
  return new Promise((resolve) => {
    try {
      new google.maps.DirectionsService().route({
        origin: { lat: from.lat, lng: from.lng },
        destination: { lat: to.lat, lng: to.lng },
        travelMode: google.maps.TravelMode.DRIVING,
      }, (result: any, status: string) => {
        const path = result?.routes?.[0]?.overview_path;
        if (status !== 'OK' || !path?.length) return resolve([]);
        resolve(path.map((p: { lat: () => number; lng: () => number }) => ({ lat: p.lat(), lng: p.lng() })));
      });
    } catch {
      resolve([]);
    }
  });
}

/** Pickup and drop-off map. A tap sets whichever stop is selected, unless this map is only showing a trip. */
export function TripMap({ pickup, dropoff, onPick, driver, height = 280, hint }: {
  pickup: Place | null;
  dropoff: Place | null;
  onPick?: (place: Place) => void;
  driver?: { lat: number; lng: number } | null;
  height?: number;
  hint?: string;
}) {
  const s = useThemedStyles(styles);
  const host = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const layers = useRef<any[]>([]);
  const routeCache = useRef<{ key: string; path: { lat: number; lng: number }[] }>({ key: '', path: [] });
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = host.current;
    if (!el || mapRef.current) return;
    let dead = false;
    const startLeaflet = async () => {
      if (dead || mapRef.current?.kind === 'leaflet') return;
      el.replaceChildren();
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link');
        link.id = 'leaflet-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      if (!document.getElementById('leaflet-fix')) {
        const style = document.createElement('style');
        style.id = 'leaflet-fix';
        style.textContent = '.leaflet-container{height:100%;width:100%;font:inherit;}.leaflet-container img{max-width:none!important;max-height:none!important;}';
        document.head.appendChild(style);
      }
      await loadScript('leaflet-js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
      if (dead) return;
      const L = (window as unknown as { L: any }).L;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      const map = L.map(el).setView([ACCRA.lat, ACCRA.lng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        if (!onPickRef.current) return;
        const { lat, lng } = e.latlng;
        onPickRef.current({ label: 'Pinned on the map', lat, lng });
        labelFor(lat, lng).then((label) => onPickRef.current?.({ label, lat, lng }));
      });
      mapRef.current = { kind: 'leaflet', map, L };
      setReady(true);
      setTimeout(() => map.invalidateSize(), 200);
    };
    const start = async () => {
      if (KEY && await googleKeyAccepted(KEY)) {
        (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
          mapRef.current = null;
          startLeaflet().catch(() => undefined);
        };
        await loadScript('google-maps-js', `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}`);
        if (dead) return;
        const google = (window as unknown as { google: any }).google;
        const map = new google.maps.Map(el, {
          center: ACCRA, zoom: 12, disableDefaultUI: true, zoomControl: true,
          mapTypeControl: false, streetViewControl: false, clickableIcons: false,
        });
        map.addListener('click', (e: { latLng: { lat: () => number; lng: () => number } }) => {
          if (!onPickRef.current) return;
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          onPickRef.current({ label: 'Pinned on the map', lat, lng });
          labelFor(lat, lng).then((label) => onPickRef.current?.({ label, lat, lng }));
        });
        mapRef.current = { kind: 'google', map, google };
        setReady(true);
        return;
      }
      await startLeaflet();
    };
    start().catch(() => undefined);
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    const engine = mapRef.current;
    if (!engine || Platform.OS !== 'web') return;
    let live = true;
    const routeKey = pickup && dropoff ? `${pickup.lat.toFixed(5)},${pickup.lng.toFixed(5)}>${dropoff.lat.toFixed(5)},${dropoff.lng.toFixed(5)}` : '';
    const draw = async () => {
      const fresh = routeCache.current.key !== routeKey;
      let path = routeCache.current.path;
      if (fresh) {
        path = [];
        if (pickup && dropoff) {
          path = engine.kind === 'google' ? await googleDrivingPath(engine.google, pickup, dropoff) : [];
          if (!live) return;
          if (!path.length) path = await roadRoute(pickup, dropoff);
        }
        if (!live) return;
        routeCache.current = { key: routeKey, path };
      }
      layers.current.forEach((layer) => (engine.kind === 'google' ? layer.setMap(null) : engine.map.removeLayer(layer)));
      layers.current = [];
      const points = [pickup, dropoff].filter((p): p is Place => !!p);
      if (engine.kind === 'google') {
        const { google, map } = engine;
        const bounds = new google.maps.LatLngBounds();
        points.forEach((p, i) => {
          const marker = new google.maps.Marker({ position: p, map, label: i === 0 && pickup ? 'A' : 'B' });
          layers.current.push(marker);
          bounds.extend(p);
        });
        if (path.length > 1) {
          layers.current.push(new google.maps.Polyline({
            path, map, strokeColor: ROUTE, strokeWeight: 6, strokeOpacity: 1,
          }));
          path.forEach((p) => bounds.extend(p));
        }
        if (driver) {
          layers.current.push(new google.maps.Marker({
            position: driver, map, title: 'Cold truck', zIndex: 5,
            icon: {
              url: TRUCK_URL,
              scaledSize: new google.maps.Size(TRUCK_W, TRUCK_H),
              anchor: new google.maps.Point(TRUCK_W / 2, TRUCK_H / 2),
            },
          }));
          bounds.extend(driver);
        }
        if (fresh && (path.length > 1 || points.length > 1)) map.fitBounds(bounds, 48);
        else if (fresh && points[0]) map.panTo(points[0]);
      } else {
        const { L, map } = engine;
        const spots: [number, number][] = [];
        points.forEach((p, i) => {
          layers.current.push(L.marker([p.lat, p.lng]).addTo(map).bindTooltip(i === 0 && pickup ? 'A' : 'B', { permanent: true, direction: 'top', opacity: 0.85 }));
          spots.push([p.lat, p.lng]);
        });
        if (path.length > 1) {
          const line = path.map((p) => [p.lat, p.lng] as [number, number]);
          layers.current.push(L.polyline(line, { color: ROUTE, weight: 6, opacity: 1 }).addTo(map));
          spots.push(...line);
        }
        if (driver) {
          const truck = L.icon({ iconUrl: TRUCK_URL, iconSize: [TRUCK_W, TRUCK_H], iconAnchor: [TRUCK_W / 2, TRUCK_H / 2] });
          layers.current.push(L.marker([driver.lat, driver.lng], { icon: truck, zIndexOffset: 500, title: 'Cold truck' }).addTo(map));
          spots.push([driver.lat, driver.lng]);
        }
        if (fresh && spots.length > 1) map.fitBounds(L.latLngBounds(spots), { padding: [32, 32] });
        else if (fresh && spots[0]) map.panTo(spots[0]);
      }
    };
    draw();
    return () => { live = false; };
  }, [pickup, dropoff, ready, driver]);

  if (Platform.OS !== 'web') {
    return pickup && dropoff ? (
      <Button label="Open route in Google Maps" variant="outline" onPress={() => Linking.openURL(
        `https://www.google.com/maps/dir/?api=1&origin=${pickup.lat},${pickup.lng}&destination=${dropoff.lat},${dropoff.lng}&travelmode=driving`,
      )} />
    ) : null;
  }

  return (
    <View style={s.wrap}>
      {React.createElement('div', {
        ref: host,
        style: { height, width: '100%', borderRadius: 16, overflow: 'hidden', background: '#e7efe9' },
      })}
      <Text style={s.hint}>{hint ?? (onPick ? 'Tap the map to set this stop.' : 'Driving route on roads a truck can use.')}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 8 },
  hint: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted },
});
