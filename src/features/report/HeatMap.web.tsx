import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { loadScript } from '../buyer/components/TripMap';
import { mapStyle } from '../../components/location/mapKit';
import { fonts, useTheme } from '../../theme';
import { fmtQty } from '../../utils/format';
import type { HeatPoint } from './farmerReport';
import type { HeatMapProps } from './heatMapTypes';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY;
const RADIUS = 34;

/** 256-step ramp from pale yellow to deep red, used to colour the accumulated density. */
const ramp = (() => {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 256, 0);
  [
    [0.0, '#fde68a'],
    [0.35, '#f59e0b'],
    [0.7, '#dc2626'],
    [1.0, '#7f1d1d'],
  ].forEach(([at, col]) => grad.addColorStop(at as number, col as string));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 1);
  return g.getImageData(0, 0, 256, 1).data;
})();

/** Google's own HeatmapLayer is retired, so density is drawn here: soft blobs summed per pixel, then coloured by the ramp. */
function makeOverlay(maps: any) {
  return class Heat extends maps.OverlayView {
    points: HeatPoint[] = [];
    canvas = document.createElement('canvas');
    onAdd() {
      this.canvas.style.cssText = 'position:absolute;pointer-events:none;opacity:0.78';
      this.getPanes().overlayLayer.appendChild(this.canvas);
    }
    onRemove() {
      this.canvas.remove();
    }
    set(points: HeatPoint[]) {
      this.points = points;
      this.draw();
    }
    draw() {
      const proj = this.getProjection();
      const map = this.getMap();
      if (!proj || !map) return;
      const b = map.getBounds();
      if (!b) return;
      const nw = proj.fromLatLngToDivPixel(
        new maps.LatLng(b.getNorthEast().lat(), b.getSouthWest().lng()),
      );
      const se = proj.fromLatLngToDivPixel(
        new maps.LatLng(b.getSouthWest().lat(), b.getNorthEast().lng()),
      );
      const w = Math.max(1, Math.round(se.x - nw.x));
      const h = Math.max(1, Math.round(se.y - nw.y));
      const cv = this.canvas;
      cv.style.left = `${nw.x}px`;
      cv.style.top = `${nw.y}px`;
      cv.width = w;
      cv.height = h;
      const g = cv.getContext('2d')!;
      g.clearRect(0, 0, w, h);
      const max = Math.max(...this.points.map((p) => p.weight), 1);
      for (const p of this.points) {
        const px = proj.fromLatLngToDivPixel(new maps.LatLng(p.lat, p.lng));
        const x = px.x - nw.x;
        const y = px.y - nw.y;
        // A farmer is never invisible next to a much bigger one.
        const a = 0.25 + 0.75 * (p.weight / max);
        const grad = g.createRadialGradient(x, y, 0, x, y, RADIUS);
        grad.addColorStop(0, `rgba(0,0,0,${a})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(x - RADIUS, y - RADIUS, RADIUS * 2, RADIUS * 2);
      }
      const img = g.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 3; i < d.length; i += 4) {
        const al = d[i];
        if (!al) continue;
        const k = Math.min(255, al * 1.6) * 4;
        d[i - 3] = ramp[k];
        d[i - 2] = ramp[k + 1];
        d[i - 1] = ramp[k + 2];
        d[i] = Math.min(255, al * 1.4);
      }
      g.putImageData(img, 0, 0);
    }
  };
}

/** Builds the popup with text nodes only: names and addresses are typed by farmers. */
function popup(p: HeatPoint) {
  const f = p.farmer;
  const el = document.createElement('div');
  el.style.cssText = 'font:13px/1.45 system-ui,sans-serif;color:#1a2a22;max-width:240px';
  const line = (t: string, bold = false) => {
    const d = document.createElement('div');
    d.textContent = t;
    if (bold) d.style.fontWeight = '700';
    el.appendChild(d);
  };
  line(f.name, true);
  line([f.locality, f.phone].filter(Boolean).join(' · '));
  Object.entries(f.totals).forEach(([u, t]) =>
    line(`${fmtQty(t.listed, u)} listed · ${fmtQty(t.remaining, u)} in stock`),
  );
  if (!f.lines.length) line('Nothing listed yet');
  return el;
}

/** Farmer density on Google Maps, with a pin per farmer that opens their details. */
export function HeatMap({ points, height = 440 }: HeatMapProps) {
  const { isDark: dark } = useTheme();
  const host = useRef<View>(null);
  const state = useRef<{ map: any; heat: any; pins: any[]; info: any; maps: any } | null>(null);
  const [error, setError] = useState<string | null>(KEY ? null : 'Map key missing.');
  const latest = useRef(points);
  latest.current = points;

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
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: 'cooperative',
          styles: mapStyle(Boolean(dark)),
        });
        const Heat = makeOverlay(maps);
        const heat = new Heat();
        heat.setMap(map);
        state.current = { map, heat, pins: [], info: new maps.InfoWindow(), maps };
        paint();
      })
      .catch(() => !dead && setError('Could not load the map.'));
    return () => {
      dead = true;
    };
    // The map is created once; data changes go through paint() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function paint() {
    const s = state.current;
    if (!s) return;
    const pts = latest.current;
    s.heat.set(pts);
    s.pins.forEach((m) => m.setMap(null));
    s.pins = pts.map((p) => {
      const m = new s.maps.Marker({
        map: s.map,
        position: { lat: p.lat, lng: p.lng },
        title: p.farmer.name,
        icon: {
          path: s.maps.SymbolPath.CIRCLE,
          scale: 4.5,
          fillColor: '#12462b',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 1.5,
        },
      });
      m.addListener('click', () => {
        s.info.setContent(popup(p));
        s.info.open(s.map, m);
      });
      return m;
    });
    if (pts.length) {
      const b = new s.maps.LatLngBounds();
      pts.forEach((p) => b.extend({ lat: p.lat, lng: p.lng }));
      s.map.fitBounds(b, 48);
      s.maps.event.addListenerOnce(s.map, 'idle', () => s.map.getZoom() > 13 && s.map.setZoom(13));
    }
  }

  useEffect(paint, [points]);
  useEffect(() => {
    state.current?.map.setOptions({ styles: mapStyle(Boolean(dark)) });
  }, [dark]);

  return (
    <View style={[styles.box, { height }]} accessibilityLabel="Map of farmers">
      <View ref={host} style={StyleSheet.absoluteFill} />
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#e8efe9' },
  err: { padding: 16, fontFamily: fonts.sansMedium },
});
