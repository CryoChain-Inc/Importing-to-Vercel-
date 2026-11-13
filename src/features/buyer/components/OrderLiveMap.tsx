import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Card, Icon } from '../../../components/common';
import { Skeleton } from '../../../components/feedback';
import { LiveMap } from '../../../components/location/LiveMap';
import { fetchOrderTracking, type OrderTracking } from '../../../services/buyer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { decodePolyline } from '../../../utils/polyline';

const POLL_MS = 15000;
const MAP_H = 260;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });

/** The truck on a map for a paid order: where it is now, and the road to the buyer once it is heading there. */
export function OrderLiveMap({ orderId, preparing }: { orderId: string; preparing?: boolean }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [t, setT] = useState<OrderTracking | null>(null);

  useEffect(() => {
    let live = true;
    const tick = () => fetchOrderTracking(orderId).then((r) => { if (live) setT(r); }, () => undefined);
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [orderId]);

  if (t && (t.state === 'waiting' || t.state === 'delivered')) return null;
  // The card is on screen from the first frame; the map and text fill in when the position arrives.
  if (!t) return (
    <Card style={s.box} accessibilityLabel="Loading the truck's position">
      <View style={s.head}>
        <Skeleton width={40} height={40} radius={20} />
        <View style={s.grow}><Skeleton width="60%" height={16} /><Skeleton width="40%" height={14} /></View>
      </View>
      <Skeleton height={MAP_H} radius={14} />
    </Card>
  );
  const route = t.polyline ? decodePolyline(t.polyline) : [];
  const places = t.destination ? [{ ...t.destination, label: 'Your delivery address', kind: 'dropoff' as const }] : [];

  return (
    <Card style={s.box}>
      <View style={s.head}>
        <View style={s.icon}><Icon name="truck" size={20} color={colors.brandInk} /></View>
        <View style={s.grow}>
          <Text style={s.title}>{t.state === 'next' ? 'The truck is heading to you' : preparing ? 'Your delivery' : 'Your produce is on a truck'}</Text>
          <Text style={s.eta}>{t.eta ? `Arriving around ${time(t.eta)}` : 'Working out the arrival time'}</Text>
        </View>
      </View>
      <View style={s.map}><LiveMap truck={t.truck} places={places} route={route} height={MAP_H} /></View>
      {t.state === 'on_the_way' ? <Text style={s.meta}>The driver is collecting produce on the way. The road to you appears here once you are next.</Text> : null}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  box: { gap: 12, padding: 16 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  grow: { flex: 1, gap: 4 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  map: { borderRadius: 14, overflow: 'hidden' as const, borderWidth: 1, borderColor: c.borderSubtle },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  eta: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.brandInk },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
