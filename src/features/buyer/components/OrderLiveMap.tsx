import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Card } from '../../../components/common';
import { LiveMap } from '../../../components/location/LiveMap';
import { fetchOrderTracking, type OrderTracking } from '../../../services/buyer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { decodePolyline } from '../../../utils/polyline';

const POLL_MS = 15000;
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });

/** The truck on a map for a paid order: where it is now, and the road to the buyer once it is heading there. */
export function OrderLiveMap({ orderId }: { orderId: string }) {
  const s = useThemedStyles(styles);
  const [t, setT] = useState<OrderTracking | null>(null);

  useEffect(() => {
    let live = true;
    const tick = () => fetchOrderTracking(orderId).then((r) => { if (live) setT(r); }, () => undefined);
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [orderId]);

  if (!t || t.state === 'waiting' || t.state === 'delivered') return null;
  const route = t.polyline ? decodePolyline(t.polyline) : [];
  const places = t.destination ? [{ ...t.destination, label: 'Your delivery address', kind: 'dropoff' as const }] : [];

  return (
    <Card style={s.box}>
      <Text style={s.title}>{t.state === 'next' ? 'The truck is heading to you' : 'Your produce is on a truck'}</Text>
      <Text style={s.eta}>{t.eta ? `Arriving around ${time(t.eta)}` : 'Working out the arrival time'}</Text>
      {t.state === 'on_the_way' ? <Text style={s.meta}>The driver is collecting produce on the way. The road to you appears here once you are next.</Text> : null}
      <LiveMap truck={t.truck} places={places} route={route} height={260} />
      {t.truck ? <Text style={s.meta}>Truck position updated {time(t.truck.at)}. Arrival includes a safety margin.</Text> : null}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  box: { gap: 10 },
  title: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  eta: { fontFamily: fonts.sansSemiBold, fontSize: 15, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
