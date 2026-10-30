import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { TripChat } from '../../truck/components/TripChat';
import { TripProgress } from '../../truck/components/TripProgress';
import type { TruckBooking } from '../../../services/truck.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { Empty } from '../../ops/components/OpsBits';
import { BackButton, DetailCard, openMaps, openPhone } from './bits';

const when = (iso: string) => new Date(iso).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' });

export function truckStatus(t: TruckBooking): { label: string; tone: 'success' | 'warning' | 'info' } {
  if (t.completedAt) return { label: 'Completed', tone: 'success' };
  if (t.startedAt) return { label: 'On the way', tone: 'info' };
  if (t.state === 'paid') return { label: 'Ready to start', tone: 'success' };
  return { label: 'Awaiting payment', tone: 'warning' };
}

export function TruckList({ trips, past, onOpen }: { trips: TruckBooking[]; past: boolean; onOpen: (id: string) => void }) {
  const s = useThemedStyles(styles);
  const rows = trips.filter((t) => (past ? !!t.completedAt : !t.completedAt));
  if (rows.length === 0) {
    return (
      <Empty
        icon="truck"
        title={past ? 'No past trips' : 'No ongoing trips'}
        hint={past ? 'Finished cold-truck bookings will be listed here.' : 'When a buyer is assigned to you, the trip shows up here. Open it for the route, the start code and messages.'}
      />
    );
  }
  return (
    <View style={s.list}>
      {rows.map((t) => {
        const status = truckStatus(t);
        return (
          <Card key={t.id} style={s.item}>
            <View style={s.top}>
              <Text style={s.name}>{t.code}</Text>
              <Badge label={status.label} tone={status.tone} />
            </View>
            <Text style={s.meta}>{when(t.pickupAt)} · {t.purpose === 'pickup' ? 'Produce pickup' : 'Transfer'}</Text>
            <Text style={s.meta}>Buyer {t.buyerName || 'Buyer'}</Text>
            <Text style={s.meta}>From {t.pickupLabel}</Text>
            <Text style={s.meta}>To {t.dropoffLabel}</Text>
            <Button size="sm" label="Open trip" onPress={() => onOpen(t.id)} />
          </Card>
        );
      })}
    </View>
  );
}

export function TruckDetail({ trip, onBack, onMessages }: { trip: TruckBooking; onBack?: () => void; onMessages: () => void }) {
  const status = truckStatus(trip);
  const placed = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  return (
    <View style={{ gap: 12 }}>
      {onBack ? <BackButton label="Cold truck" onPress={onBack} /> : null}
      <DetailCard
        title={`${trip.code} · ${status.label}`}
        lines={[
          when(trip.pickupAt),
          `Buyer ${trip.buyerName || 'Buyer'}`,
          trip.buyerPhone ? `Phone ${trip.buyerPhone}` : '',
          `From ${trip.pickupLabel}`,
          `To ${trip.dropoffLabel}`,
          trip.distanceKm ? `${trip.distanceKm} km` : '',
        ]}
        actions={
          <>
            {trip.buyerPhone ? <Button size="sm" variant="outline" icon="phone" label="Call buyer" onPress={() => openPhone(trip.buyerPhone)} /> : null}
            {placed(trip.pickupLat, trip.pickupLng) ? <Button size="sm" variant="outline" icon="pin" label="Pickup" onPress={() => openMaps(trip.pickupLat, trip.pickupLng)} /> : null}
            {placed(trip.dropoffLat, trip.dropoffLng) ? <Button size="sm" variant="outline" icon="pin" label="Drop-off" onPress={() => openMaps(trip.dropoffLat, trip.dropoffLng)} /> : null}
            <Button size="sm" icon="message" label="Messages" onPress={onMessages} />
          </>
        }
      />
      <TripProgress booking={trip} role="driver" />
    </View>
  );
}

export function TruckMessages({ trip, onBack }: { trip: TruckBooking; onBack: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <BackButton label="Back to trip" onPress={onBack} />
      <TripChat bookingId={trip.id} peerName={trip.buyerName || 'the buyer'} peerPhone={trip.buyerPhone} peerRole="buyer" />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 8 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
