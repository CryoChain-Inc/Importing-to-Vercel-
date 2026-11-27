import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { rampRgba } from './heat';
import type { HeatCanvasProps } from './heatTypes';

/** Native: each farmer is three stacked discs, wide and cool to small and hot, so overlaps build into a gradient. */
export function HeatCanvas({ points, selectedId, onSelect, fitSignal }: HeatCanvasProps) {
  const map = useRef<MapView>(null);
  const ids = points.map((p) => p.id).join();
  useEffect(() => {
    if (!points.length) return;
    const t = setTimeout(
      () =>
        map.current?.fitToCoordinates(
          points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
          { edgePadding: { top: 90, right: 60, bottom: 90, left: 60 }, animated: true },
        ),
      300,
    );
    return () => clearTimeout(t);
    // Refit when the set of farmers changes, or on request; not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, fitSignal]);
  const max = Math.max(...points.map((p) => p.weight), 1);
  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      toolbarEnabled={false}
      onPress={() => onSelect(null)}
    >
      {points.map((p) => {
        const t = p.weight / max;
        const r = 3500 + 6500 * t;
        return (
          <React.Fragment key={p.id}>
            <Circle
              center={{ latitude: p.lat, longitude: p.lng }}
              radius={r}
              fillColor={rampRgba(t * 0.5, 0.18)}
              strokeWidth={0}
            />
            <Circle
              center={{ latitude: p.lat, longitude: p.lng }}
              radius={r * 0.62}
              fillColor={rampRgba(0.15 + t * 0.55, 0.26)}
              strokeWidth={0}
            />
            <Circle
              center={{ latitude: p.lat, longitude: p.lng }}
              radius={r * 0.3}
              fillColor={rampRgba(0.3 + t * 0.7, 0.4)}
              strokeWidth={0}
            />
            <Marker
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              pinColor={p.id === selectedId ? '#dc2626' : '#12462b'}
              onPress={() => onSelect(p)}
            />
          </React.Fragment>
        );
      })}
    </MapView>
  );
}
