import React from 'react';
import { Text, View } from 'react-native';
import { Badge, Card } from '../../../components/common';
import { TripChat } from '../../truck/components/TripChat';
import { TripProgress } from '../../truck/components/TripProgress';
import type { TruckBooking } from '../../../services/truck.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { Empty } from '../../ops/components/OpsBits';
import { BackButton, openMaps, openPhone, placed, QuickActions, RowCard } from './bits';

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
        hint={past ? 'Finished cold-truck bookings will be listed here.' : 'When a buyer is assigned to you, the trip shows up here.'}
      />
    );
  }
  return (
    <View style={s.list}>
      {rows.map((t) => {
        const status = truckStatus(t);
        return (
          <RowCard
            key={t.id}
            title={`${t.pickupLabel} → ${t.dropoffLabel}`}
            sub={`${t.code} · ${when(t.pickupAt)}`}
            right={past ? undefined : <Badge label={status.label} tone={status.tone} />}
            onPress={() => onOpen(t.id)}
          />
        );
      })}
    </View>
  );
}

export function TruckDetail({ trip, onBack, onMessages }: { trip: TruckBooking; onBack?: () => void; onMessages: () => void }) {
  const s = useThemedStyles(styles);
  const status = truckStatus(trip);
  const target = trip.startedAt
    ? { label: 'Drop-off', lat: trip.dropoffLat, lng: trip.dropoffLng }
    : { label: 'Pickup', lat: trip.pickupLat, lng: trip.pickupLng };
  const actions = [
    ...(trip.buyerPhone ? [{ icon: 'phone' as const, label: 'Call', onPress: () => openPhone(trip.buyerPhone) }] : []),
    ...(placed(target.lat, target.lng) ? [{ icon: 'pin' as const, label: `Go to ${target.label.toLowerCase()}`, onPress: () => openMaps(target.lat, target.lng) }] : []),
    { icon: 'message' as const, label: 'Chat', onPress: onMessages },
  ];
  return (
    <View style={s.stack}>
      {onBack ? <BackButton label="Cold truck" onPress={onBack} /> : null}
      <Card style={s.card}>
        <View style={s.top}>
          <Text style={s.code}>{trip.code}</Text>
          <Badge label={status.label} tone={status.tone} />
        </View>
        <View style={s.route}>
          <Stop tag="From" text={trip.pickupLabel} />
          <Stop tag="To" text={trip.dropoffLabel} />
        </View>
        <Text style={s.meta}>
          {when(trip.pickupAt)}{trip.distanceKm ? ` · ${trip.distanceKm} km` : ''} · Buyer {trip.buyerName || 'Buyer'}
        </Text>
        <QuickActions items={actions} />
      </Card>
      <TripProgress booking={trip} role="driver" />
    </View>
  );
}

function Stop({ tag, text }: { tag: string; text: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.stop}>
      <Text style={s.tag}>{tag}</Text>
      <Text style={s.place}>{text}</Text>
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
  stack: { gap: 14 },
  card: { gap: 14 },
  top: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 8 },
  code: { fontFamily: fonts.sansBold, fontSize: 14, color: c.inkMuted },
  route: { gap: 12 },
  stop: { gap: 2 },
  tag: { fontFamily: fonts.sansBold, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' as const, color: c.brandInk },
  place: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
