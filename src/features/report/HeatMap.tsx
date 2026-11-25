import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Circle, Marker } from 'react-native-maps';
import { fonts } from '../../theme';
import { fmtQty } from '../../utils/format';
import type { HeatMapProps } from './heatMapTypes';

/** Native: each farmer is a wide translucent disc sized by weight, so overlaps read as density. */
export function HeatMap({ points, height = 360 }: HeatMapProps) {
  const map = useRef<MapView>(null);
  useEffect(() => {
    if (!points.length) return;
    const t = setTimeout(
      () =>
        map.current?.fitToCoordinates(
          points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
          { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true },
        ),
      300,
    );
    return () => clearTimeout(t);
  }, [points]);
  const max = Math.max(...points.map((p) => p.weight), 1);
  return (
    <View style={[styles.box, { height }]}>
      <MapView ref={map} style={StyleSheet.absoluteFill} toolbarEnabled={false}>
        {points.map((p) => (
          <React.Fragment key={p.id}>
            <Circle
              center={{ latitude: p.lat, longitude: p.lng }}
              radius={2500 + 5500 * (p.weight / max)}
              fillColor="rgba(220,38,38,0.22)"
              strokeColor="rgba(220,38,38,0)"
            />
            <Marker coordinate={{ latitude: p.lat, longitude: p.lng }} pinColor="#12462b">
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.name}>{p.farmer.name}</Text>
                  <Text>{p.farmer.locality}</Text>
                  {Object.entries(p.farmer.totals).map(([u, t]) => (
                    <Text
                      key={u}
                    >{`${fmtQty(t.listed, u)} listed · ${fmtQty(t.remaining, u)} left`}</Text>
                  ))}
                </View>
              </Callout>
            </Marker>
          </React.Fragment>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, overflow: 'hidden' },
  callout: { minWidth: 160, gap: 2 },
  name: { fontFamily: fonts.sansBold },
});
