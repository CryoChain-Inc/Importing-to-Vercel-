import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { mapStyle } from '../../components/location/mapKit';
import type { ReportPoint } from '../../services/report.service';
import { fonts, useTheme } from '../../theme';
import { loadScript } from '../buyer/components/TripMap';
import { rampRgb } from './heat';
import type { HeatCanvasProps } from './heatTypes';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
const PINS_FROM_ZOOM = 9;
const MANY = 250;
const BUCKETS = 16;

/** One soft glow per colour step, as a data URL: a centre at full strength fading to nothing at the edge. */
const glows = new Map<number, string>();
function glow(bucket: number) {
  let url = glows.get(bucket);
  if (!url) {
    const [r, g, b] = rampRgb(bucket / (BUCKETS - 1));
    const c = `rgb(${r},${g},${b})`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs><radialGradient id="g">` +
      `<stop offset="0" stop-color="${c}" stop-opacity="0.95"/><stop offset="0.35" stop-color="${c}" stop-opacity="0.7"/>` +
      `<stop offset="0.7" stop-color="${c}" stop-opacity="0.28"/><stop offset="1" stop-color="${c}" stop-opacity="0"/>` +
      `</radialGradient></defs><circle cx="64" cy="64" r="64" fill="url(#g)"/></svg>`;
    url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    glows.set(bucket, url);
  }
  return url;
}

/**
 * How hot each farmer's spot is, 0..1: a farmer's own weight plus their neighbours' within the glow radius (in screen
 * pixels at the current zoom). A lone farmer reads green; crowded spots climb to yellow, orange and crimson.
 */
function heat(maps: any, map: any, pts: ReportPoint[], radius: number): number[] {
  const proj = map.getProjection();
  if (!proj) return pts.map(() => 0.3);
  const scale = 2 ** map.getZoom();
  const xy = pts.map((p) => {
    const w = proj.fromLatLngToPoint(new maps.LatLng(p.lat, p.lng));
    return [w.x * scale, w.y * scale];
  });
  const cells = new Map<string, number[]>();
  const cell = (x: number, y: number) => `${Math.floor(x / radius)},${Math.floor(y / radius)}`;
  xy.forEach(([x, y], i) => {
    const k = cell(x, y);
    cells.set(k, [...(cells.get(k) ?? []), i]);
  });
  const sum = xy.map(([x, y], i) => {
    let t = 0;
    const cx = Math.floor(x / radius);
    const cy = Math.floor(y / radius);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          const d = Math.hypot(xy[j][0] - x, xy[j][1] - y);
          if (d < radius) t += pts[j].weight * (1 - d / radius);
        }
    return t || pts[i].weight;
  });
  const maxW = Math.max(...pts.map((p) => p.weight), 1);
  const denom = Math.max(...sum, 3 * maxW);
  return sum.map((v) => Math.min(1, 0.12 + 0.88 * (v / denom)));
}

const pin = (maps: any, on: boolean) => ({
  path: maps.SymbolPath.CIRCLE,
  scale: on ? 8 : 4.2,
  fillColor: on ? '#ffffff' : '#0a3d24',
  fillOpacity: 1,
  strokeColor: on ? '#0a3d24' : '#ffffff',
  strokeWeight: on ? 3.5 : 1.6,
});

/**
 * Google Maps with a gradient glow under every farmer (colour = how crowded the spot is, size follows the zoom)
 * and a pin on top that opens the farmer.
 */
export function HeatCanvas({ points, selectedId, onSelect, fitSignal }: HeatCanvasProps) {
  const { isDark: dark } = useTheme();
  const host = useRef<View>(null);
  const state = useRef<{ map: any; maps: any; pins: Map<string, any>; glows: any[] } | null>(null);
  const [error, setError] = useState<string | null>(KEY ? null : 'Map key missing.');
  const latest = useRef({ points, selectedId, onSelect });
  latest.current = { points, selectedId, onSelect };
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!KEY) return;
    let dead = false;
    loadScript(
      'google-maps-js',
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}`,
    )
      .then(() => {
        if (dead || !host.current) return;
        const maps = (window as any).google.maps;
        const map = new maps.Map(host.current as unknown as HTMLElement, {
          center: { lat: 7.9, lng: -1.0 },
          zoom: 6,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
          clickableIcons: false,
          gestureHandling: 'cooperative',
          styles: mapStyle(Boolean(dark)),
        });
        map.addListener('click', () => latest.current.onSelect(null));
        map.addListener('zoom_changed', () => restyle());
        state.current = { map, maps, pins: new Map(), glows: [] };
        setReady(true);
      })
      .catch(() => !dead && setError('Could not load the map.'));
    return () => {
      dead = true;
    };
    // The map is created once; data changes go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Size and colour of every glow for the current zoom; pins show once the map is close or the farmers are few. */
  function restyle() {
    const s = state.current;
    if (!s) return;
    const pts = latest.current.points;
    const zoom = s.map.getZoom() ?? 6;
    const radius = Math.min(110, Math.max(44, 22 + zoom * 6));
    const t = heat(s.maps, s.map, pts, radius);
    s.glows.forEach((m, i) =>
      m.setIcon({
        url: glow(Math.round(t[i] * (BUCKETS - 1))),
        scaledSize: new s.maps.Size(radius * 2, radius * 2),
        anchor: new s.maps.Point(radius, radius),
      }),
    );
    const on = s.pins.size <= MANY || zoom >= PINS_FROM_ZOOM;
    s.pins.forEach((m, id) => m.setVisible(on || id === latest.current.selectedId));
  }

  function fit() {
    const s = state.current;
    const pts = latest.current.points;
    if (!s || !pts.length) return;
    const b = new s.maps.LatLngBounds();
    pts.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
    s.map.fitBounds(b, 72);
    s.maps.event.addListenerOnce(s.map, 'idle', () => s.map.getZoom() > 12 && s.map.setZoom(12));
  }

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.glows.forEach((m) => m.setMap(null));
    s.pins.forEach((m) => m.setMap(null));
    s.glows = points.map(
      (p) =>
        new s.maps.Marker({
          map: s.map,
          position: { lat: p.lat, lng: p.lng },
          clickable: false,
          optimized: false,
          zIndex: 1,
        }),
    );
    s.pins = new Map(
      points.map((p) => {
        const m = new s.maps.Marker({
          map: s.map,
          position: { lat: p.lat, lng: p.lng },
          title: p.name,
          zIndex: 2,
          icon: pin(s.maps, p.id === latest.current.selectedId),
        });
        m.addListener('click', () => latest.current.onSelect(p));
        return [p.id, m];
      }),
    );
    restyle();
    fit();
    // The map's projection isn't ready until its first idle; paint the colours again then.
    s.maps.event.addListenerOnce(s.map, 'idle', restyle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, points]);
  useEffect(fit, [fitSignal]);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.pins.forEach((m, id) => m.setIcon(pin(s.maps, id === selectedId)));
    const sel = points.find((p) => p.id === selectedId);
    if (sel) s.map.panTo({ lat: sel.lat, lng: sel.lng });
    restyle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    state.current?.map.setOptions({ styles: mapStyle(Boolean(dark)) });
  }, [dark]);

  return (
    <View style={StyleSheet.absoluteFill} accessibilityLabel="Map of farmers">
      <View ref={host} style={StyleSheet.absoluteFill} />
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  err: { padding: 16, fontFamily: fonts.sansMedium },
});
