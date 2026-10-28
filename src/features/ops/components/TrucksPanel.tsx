import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { assignTruckDriver, cancelOpsTruckBooking, confirmTruckPayment, fetchOpsTruckBookings, fetchTruckRate, saveTruckFare, saveTruckRate, type OpsTruckBooking } from '../../../services/ops.trucks.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { useAction } from './useAction';

/** Per-kilometre rate and every cold-truck booking. A driver is assigned when the buyer books. */
export function TrucksPanel() {
  const s = useThemedStyles(styles);
  const [rate, setRate] = useState('');
  const [bookings, setBookings] = useState<OpsTruckBooking[]>([]);
  const [fares, setFares] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, run } = useAction(load);

  async function load() {
    try {
      const [priced, rows] = await Promise.all([fetchTruckRate(), fetchOpsTruckBookings()]);
      setRate(String(priced.pricePerKm || ''));
      setBookings(rows);
      setFares(Object.fromEntries(rows.map((b) => [b.id, String(b.amount)])));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load truck bookings.');
    }
  }

  useEffect(() => { load(); }, []);

  const awaiting = bookings.filter((b) => b.state === 'awaiting_payment').length;

  return (
    <View style={s.list}>
      {loadError ? <Banner text={loadError} /> : null}
      {error ? <Banner text={error} /> : null}
      <Card style={s.form}>
        <Text style={s.title}>Price per kilometre</Text>
        <Text style={s.meta}>Every new booking is priced as the driving distance times this rate. Changing it does not change trips already booked.</Text>
        <Input label="GH₵ per km" value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
        <Button label="Save rate" loading={busy} disabled={!Number(rate)} onPress={() => run(() => saveTruckRate(Number(rate)))} />
      </Card>
      <Text style={s.meta}>{awaiting} awaiting payment. A driver is assigned automatically when the buyer books.</Text>
      {bookings.length === 0 ? <Card><Text style={s.meta}>No truck bookings yet.</Text></Card> : null}
      {bookings.map((b) => (
        <Card key={b.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{b.code} · {ghs(b.amount)}</Text>
            <Badge label={b.completedAt ? 'Completed' : b.state === 'awaiting_payment' ? 'Awaiting payment' : b.state === 'paid' ? 'Paid' : 'Cancelled'} tone={b.completedAt || b.state === 'paid' ? 'success' : b.state === 'cancelled' ? 'neutral' : 'warning'} />
          </View>
          <Text style={s.meta}>{b.buyer} · {b.purpose === 'transfer' ? 'Transfer' : 'Pick up'}</Text>
          <Text style={s.meta}>{b.pickupLabel}</Text>
          <Text style={s.meta}>to {b.dropoffLabel}</Text>
          <Text style={s.meta}>{new Date(b.pickupAt).toLocaleString('en-GH')} · {b.distanceKm} km at {ghs(b.pricePerKm)}/km</Text>
          <Text style={s.meta}>{b.driverName || b.driverPlate ? `Driver ${b.driverName || 'Assigned'}${b.driverPlate ? ` · ${b.driverPlate}` : ''}` : 'No driver is free for this time yet.'}</Text>
          {b.state !== 'cancelled' && !b.driverName && !b.driverPlate ? (
            <Button size="sm" variant="outline" label="Assign a driver" loading={busy} onPress={() => run(() => assignTruckDriver(b.id))} />
          ) : null}
          {b.state === 'awaiting_payment' ? (
            <View style={s.actions}>
              <Input label="Fare (GH₵)" value={fares[b.id] ?? ''} onChangeText={(v) => setFares({ ...fares, [b.id]: v })} keyboardType="decimal-pad" />
              <Button size="sm" variant="outline" label="Set fare" loading={busy} disabled={!Number(fares[b.id])} onPress={() => run(() => saveTruckFare(b.id, Number(fares[b.id])))} />
              <Button size="sm" label="Confirm payment" loading={busy} onPress={() => run(() => confirmTruckPayment(b.id))} />
              <Button size="sm" variant="outline" label="Cancel booking" loading={busy} onPress={() => run(() => cancelOpsTruckBooking(b.id))} />
            </View>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 10 },
  item: { gap: 6, alignItems: 'flex-start' as const },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'stretch' as const },
  actions: { gap: 8, alignSelf: 'stretch' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
