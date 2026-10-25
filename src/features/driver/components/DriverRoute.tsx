import * as Location from 'expo-location';
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { completeStop, fetchMyRoute, pingLocation, type RouteStop } from '../../../services/driver.route.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { useAction } from '../../ops/components/useAction';

const PING_MS = 30000;

/**
 * The driver's route, built and re-ordered by the system as orders change. While this screen is open the driver's
 * position is shared every 30 seconds so new orders go to the nearest free driver.
 */
export function DriverRoute() {
  const s = useThemedStyles(styles);
  const [stops, setStops] = useState<RouteStop[] | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const load = useCallback(async () => { setStops(await fetchMyRoute().catch(() => [])); }, []);
  const { busy, error, run } = useAction(load);

  useEffect(() => {
    let live = true;
    const ping = async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') { if (live) setLocationError('Allow location so we can send you the nearest orders.'); return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await pingLocation(pos.coords.latitude, pos.coords.longitude);
        if (live) setLocationError(null);
        await load();
      } catch {
        if (live) setLocationError('Could not share your location. Check that location is on.');
      }
    };
    ping();
    const t = setInterval(ping, PING_MS);
    return () => { live = false; clearInterval(t); };
  }, [load]);

  const pending = (stops ?? []).filter((x) => x.state === 'pending');
  const done = (stops ?? []).filter((x) => x.state === 'done');
  const navigate = (x: RouteStop) => Linking.openURL(Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${x.lat},${x.lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}`);

  return (
    <View style={s.list}>
      <Text style={s.title}>Today&apos;s route</Text>
      {locationError ? <Banner text={locationError} /> : null}
      {error ? <Banner text={error} /> : null}
      {stops && pending.length === 0 ? <Card><Text style={s.meta}>No stops right now. New orders near you are added automatically.</Text></Card> : null}
      {pending.map((x, i) => (
        <Card key={x.id} tone={i === 0 ? 'tint' : 'default'} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{i + 1}. {x.label}</Text>
            <Badge label={x.kind === 'pickup' ? 'Pick up' : 'Deliver'} tone={x.kind === 'pickup' ? 'info' : 'success'} />
          </View>
          <Text style={s.meta}>{x.order}</Text>
          <View style={s.actions}>
            <Button size="sm" variant="outline" label="Navigate" onPress={() => navigate(x)} />
            <Button size="sm" label={x.kind === 'pickup' ? 'Collected' : 'Delivered'} loading={busy} onPress={() => run(() => completeStop(x.id))} />
          </View>
        </Card>
      ))}
      {done.length > 0 ? <Text style={s.meta}>{done.length} recent stop{done.length === 1 ? '' : 's'} completed.</Text> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 8 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  actions: { flexDirection: 'row' as const, gap: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
