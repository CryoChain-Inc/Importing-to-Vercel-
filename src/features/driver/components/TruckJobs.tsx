import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Card } from '../../../components/common';
import { TripChat } from '../../truck/components/TripChat';
import { TripProgress } from '../../truck/components/TripProgress';
import { fetchDriverTrips, type TruckBooking } from '../../../services/truck.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

/** Cold-truck trips assigned to this driver, with a call and messages for the buyer. */
export function TruckJobs() {
  const s = useThemedStyles(styles);
  const [trips, setTrips] = useState<TruckBooking[]>([]);

  useEffect(() => {
    let live = true;
    const tick = () => { fetchDriverTrips().then((rows) => { if (live) setTrips(rows); }, () => undefined); };
    tick();
    const timer = setInterval(tick, 8000);
    return () => { live = false; clearInterval(timer); };
  }, []);

  if (trips.length === 0) return null;

  return (
    <View style={s.list}>
      <Text style={s.title}>Cold truck trips</Text>
      {trips.map((t) => (
        <Card key={t.id} style={s.item}>
          <Text style={s.name}>{t.code} · {new Date(t.pickupAt).toLocaleString('en-GH')}</Text>
          <Badge label={t.startedAt ? 'On the way' : t.state === 'paid' ? 'Paid' : 'Awaiting payment'} tone={t.state === 'paid' ? 'success' : 'warning'} />
          <Text style={s.meta}>Buyer {t.buyerName || 'Buyer'}</Text>
          <Text style={s.meta}>From {t.pickupLabel}</Text>
          <Text style={s.meta}>To {t.dropoffLabel}</Text>
          <TripProgress booking={t} role="driver" />
          <TripChat bookingId={t.id} peerName={t.buyerName || 'the buyer'} peerPhone={t.buyerPhone} peerRole="buyer" />
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 8 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
