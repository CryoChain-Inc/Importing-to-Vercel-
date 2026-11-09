import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  addHourRate, assignTruckDriver, cancelOpsTruckBooking, confirmTruckPayment, deleteHourRate,
  fetchOpsHourRates, fetchOpsTruckBookings, fetchTruckDriverOptions, saveHourRate, saveTruckFare,
  type OpsTruckBooking, type TruckDriverOption, type TruckHourRate,
} from '../../../services/ops.trucks.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { elapsedLabel, hoursLabel } from '../../../utils/duration';
import { ghs } from '../../../utils/format';
import { useAction } from './useAction';

/** Hour packages and every cold-truck booking. Operations allots a driver from who is free. */
export function TrucksPanel() {
  const s = useThemedStyles(styles);
  const [rates, setRates] = useState<TruckHourRate[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [hours, setHours] = useState('');
  const [price, setPrice] = useState('');
  const [bookings, setBookings] = useState<OpsTruckBooking[]>([]);
  const [fares, setFares] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busy, error, run } = useAction(load);

  async function load() {
    try {
      const [packages, rows] = await Promise.all([fetchOpsHourRates(), fetchOpsTruckBookings()]);
      setRates(packages);
      setPrices(Object.fromEntries(packages.map((r) => [r.id, String(r.price)])));
      setBookings(rows);
      setFares(Object.fromEntries(rows.map((b) => [b.id, String(b.amount)])));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load truck bookings.');
    }
  }

  useEffect(() => { load(); }, []);

  const awaiting = bookings.filter((b) => b.state === 'awaiting_payment').length;
  const unassigned = bookings.filter((b) => b.state !== 'cancelled' && !b.completedAt && !b.driverId && !b.driverName).length;

  return (
    <View style={s.list}>
      {loadError ? <Banner text={loadError} /> : null}
      {error ? <Banner text={error} /> : null}
      <Card style={s.form}>
        <Text style={s.title}>Hour packages</Text>
        <Text style={s.meta}>Buyers pick one of these packages. The fare is this price, not kilometres. Add 4, 8, 12 hours, or any length you need.</Text>
        {rates.map((r) => (
          <View key={r.id} style={s.rateRow}>
            <Text style={s.name}>{hoursLabel(r.hours)}</Text>
            <Input label="GH₵" value={prices[r.id] ?? ''} onChangeText={(v) => setPrices({ ...prices, [r.id]: v })} keyboardType="decimal-pad" />
            <Button size="sm" variant="outline" label="Save" loading={busy} disabled={!Number(prices[r.id])} onPress={() => run(() => saveHourRate(r.id, Number(prices[r.id])))} />
            <Button size="sm" variant="ghost" label="Remove" loading={busy} onPress={() => run(() => deleteHourRate(r.id))} />
          </View>
        ))}
        <Input label="Hours" value={hours} onChangeText={setHours} keyboardType="number-pad" />
        <Input label="Price (GH₵)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        <Button
          label="Add hour package"
          loading={busy}
          disabled={!Number(hours) || !Number(price)}
          onPress={() => run(async () => {
            await addHourRate(Number(hours), Number(price));
            setHours('');
            setPrice('');
          })}
        />
      </Card>
      <Text style={s.meta}>{awaiting} awaiting payment. {unassigned} still need a driver. Allot a driver from who is free for that window — assignment is not automatic.</Text>
      {bookings.length === 0 ? <Card><Text style={s.meta}>No truck bookings yet.</Text></Card> : null}
      {bookings.map((b) => (
        <Card key={b.id} style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>{b.code} · {ghs(b.amount)}</Text>
            <Badge label={b.completedAt ? 'Completed' : b.startedAt ? 'On the way' : b.state === 'awaiting_payment' ? 'Awaiting payment' : b.state === 'paid' ? 'Paid' : 'Cancelled'} tone={b.completedAt || b.state === 'paid' ? 'success' : b.state === 'cancelled' ? 'neutral' : 'warning'} />
          </View>
          <Text style={s.meta}>{b.buyer} · {b.purpose === 'transfer' ? 'Transfer' : 'Pick up'}</Text>
          <Text style={s.meta}>{b.pickupLabel}</Text>
          <Text style={s.meta}>to {b.dropoffLabel}</Text>
          <Text style={s.meta}>{new Date(b.pickupAt).toLocaleString('en-GH')}{b.bookedHours ? ` · ${hoursLabel(b.bookedHours)}` : ''}</Text>
          {b.startedAt ? <Text style={s.meta}>On the clock {elapsedLabel(b.startedAt, b.completedAt)}{b.bookedHours ? ` of ${hoursLabel(b.bookedHours)} booked` : ''}.</Text> : null}
          <Text style={s.meta}>{b.driverName || b.driverPlate ? `Driver ${b.driverName || 'Assigned'}${b.driverPlate ? ` · ${b.driverPlate}` : ''}` : 'No driver allotted yet.'}</Text>
          {b.state !== 'cancelled' && !b.startedAt ? (
            <AssignDriver booking={b} currentId={b.driverId} run={run} />
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

function AssignDriver({
  booking, currentId, run,
}: {
  booking: OpsTruckBooking;
  currentId: string;
  run: (fn: () => Promise<void>) => void;
}) {
  const s = useThemedStyles(styles);
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<TruckDriverOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const labelOf = (d: TruckDriverOption) => [d.name, d.vehicle, d.plate].filter(Boolean).join(' · ') || d.id;
  const free = (drivers ?? []).filter((d) => d.available);
  const options = free.map(labelOf);
  const current = (drivers ?? []).find((d) => d.id === currentId);

  const load = async () => {
    try {
      setDrivers(await fetchTruckDriverOptions(booking.id));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load drivers.');
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open, booking.id]);

  return (
    <View style={s.actions}>
      <Button size="sm" variant="outline" label={open ? 'Hide drivers' : currentId || booking.driverName ? 'Change driver' : 'Allot a driver'} onPress={() => setOpen((v) => !v)} />
      {open ? (
        <>
          {loadError ? <Banner text={loadError} /> : null}
          {drivers && free.length === 0 ? <Banner tone="info" text="No driver is free for this window. Invite a driver on Team, or wait until an overlapping trip ends." /> : null}
          {free.length > 0 ? (
            <ChoiceChips
              label="Available drivers"
              options={options}
              value={current?.available ? labelOf(current) : ''}
              onChange={(label) => {
                const hit = free.find((d) => labelOf(d) === label);
                if (hit) run(() => assignTruckDriver(booking.id, hit.id));
              }}
            />
          ) : null}
          {(drivers ?? []).filter((d) => !d.available).map((d) => (
            <Text key={d.id} style={s.meta}>Busy · {labelOf(d)}</Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  form: { gap: 10 },
  rateRow: { gap: 8, alignSelf: 'stretch' as const },
  item: { gap: 6, alignItems: 'flex-start' as const },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'stretch' as const },
  actions: { gap: 8, alignSelf: 'stretch' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
