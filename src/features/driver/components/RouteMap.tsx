import React from 'react';
import { Text, View } from 'react-native';
import { LiveMap, type LivePlace } from '../../../components/location/LiveMap';
import type { LatLng } from '../../../components/location/liveMapTypes';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { DrivePath } from '../drivePath';
import type { Stop } from '../stops';
import { placed } from './bits';

/** The road ahead: the truck, every stop still to make (numbered in driving order) and the route through them. */
export function RouteMap({
  position,
  todo,
  visited,
  path,
  height = 280,
}: {
  position: LatLng | null;
  todo: Stop[];
  visited: Stop[];
  path: DrivePath | null;
  height?: number;
}) {
  const s = useThemedStyles(styles);
  const spots = todo.filter((x) => placed(x.lat, x.lng));
  const places: LivePlace[] = [
    ...visited
      .filter((x) => placed(x.lat, x.lng))
      .map((x) => ({ lat: x.lat, lng: x.lng, label: x.name, kind: 'done' as const })),
    ...spots.map((x, i) => ({
      lat: x.lat,
      lng: x.lng,
      label: `${i + 1}. ${x.name}`,
      kind: x.kind,
    })),
  ];
  // Without a road from the router the map still joins the dots, so the order of the stops stays visible.
  const route = path?.path ?? [...(position ? [position] : []), ...spots];
  return (
    <View style={s.wrap}>
      <LiveMap truck={position} places={places} route={route} height={height} />
      {spots.length === 0 ? (
        <View style={s.veil} pointerEvents="none">
          <Text style={s.veilText}>No stops with a map pin yet</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { borderRadius: 20, overflow: 'hidden' as const, backgroundColor: c.surfaceSunken },
  veil: {
    position: 'absolute' as const,
    left: 12,
    right: 12,
    bottom: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: c.surfaceCard,
  },
  veilText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: c.inkMuted,
    textAlign: 'center' as const,
  },
});
