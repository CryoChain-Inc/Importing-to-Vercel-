import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner, Reveal } from '../../../components/feedback';
import {
  addHourRate,
  assignTruckDriver,
  cancelOpsTruckBooking,
  confirmTruckPayment,
  deleteHourRate,
  fetchOpsHourRates,
  fetchOpsTruckBookings,
  fetchTruckDriverOptions,
  saveHourRate,
  saveTruckFare,
  type OpsTruckBooking,
  type TruckDriverOption,
  type TruckHourRate,
} from '../../../services/ops.trucks.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { elapsedLabel, hoursLabel } from '../../../utils/duration';
import { ghs } from '../../../utils/format';
import { Empty, PanelSkeleton, SectionTitle, Stat, StatGrid } from './OpsBits';
import { useAction } from './useAction';

/** Hour packages and every cold-truck booking. Operations allots a driver from who is free. */
export function TrucksPanel() {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [loaded, setLoaded] = useState(false);
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
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const awaiting = bookings.filter((b) => b.state === 'awaiting_payment').length;
  const unassigned = bookings.filter(
    (b) => b.state !== 'cancelled' && !b.completedAt && !b.driverId && !b.driverName,
  ).length;

  if (!loaded) return <PanelSkeleton variant="stats" />;
  const active = bookings.filter((b) => b.state !== 'cancelled' && !b.completedAt);

  return (
    <View style={s.list}>
      {loadError ? <Banner text={loadError} /> : null}
      {error ? <Banner text={error} /> : null}
      <StatGrid>
        <Stat icon="truck" label="Open bookings" value={String(active.length)} tone="brand" />
        <Stat
          icon="banknote"
          label="Awaiting payment"
          value={String(awaiting)}
          tone={awaiting ? 'warn' : undefined}
        />
        <Stat
          icon="users"
          label="Need a driver"
          value={String(unassigned)}
          tone={unassigned ? 'danger' : undefined}
          note="Allotted by hand"
        />
      </StatGrid>
      <Reveal>
      <Card style={s.form}>
        <Text style={s.title}>Hour packages</Text>
        <Text style={s.meta}>
          Buyers pick one of these packages. The fare is this price, not kilometres. Add 4, 8, 12
          hours, or any length you need.
        </Text>
        {rates.map((r) => (
          <View key={r.id} style={s.rateRow}>
            <Text style={[s.name, s.rateName]}>{hoursLabel(r.hours)}</Text>
            <Input
              label="GH₵"
              value={prices[r.id] ?? ''}
              onChangeText={(v) => setPrices({ ...prices, [r.id]: v })}
              keyboardType="decimal-pad"
              style={s.rateInput}
            />
            <Button
              size="sm"
              variant="outline"
              label="Save"
              loading={busy}
              disabled={!Number(prices[r.id])}
              onPress={() => run(() => saveHourRate(r.id, Number(prices[r.id])))}
            />
            <Button
              size="sm"
              variant="ghost"
              label="Remove"
              loading={busy}
              onPress={() => run(() => deleteHourRate(r.id))}
            />
          </View>
        ))}
        <View style={s.addRow}>
          <Input
            label="Hours"
            value={hours}
            onChangeText={setHours}
            keyboardType="number-pad"
            style={s.rateInput}
          />
          <Input
            label="Price (GH₵)"
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            style={s.rateInput}
          />
        </View>
        <Button
          label="Add hour package"
          loading={busy}
          disabled={!Number(hours) || !Number(price)}
          onPress={() =>
            run(async () => {
              await addHourRate(Number(hours), Number(price));
              setHours('');
              setPrice('');
            })
          }
        />
      </Card>
      </Reveal>
      <SectionTitle
        title="Bookings"
        note="Allot a driver from who is free for that window. Assignment is not automatic."
      />
      {bookings.length === 0 ? (
        <Empty
          icon="truck"
          title="No truck bookings yet"
          hint="When a buyer books a cold truck by the hour it appears here, ready for a driver."
        />
      ) : null}
      <View style={s.grid}>
      {bookings.map((b, bi) => (
        <Reveal key={b.id} index={bi} style={s.cell}>
        <Card style={s.item}>
          <View style={s.top}>
            <Text style={s.name}>
              {b.code} · {ghs(b.amount)}
            </Text>
            <Badge
              label={
                b.completedAt
                  ? 'Completed'
                  : b.startedAt
                    ? 'On the way'
                    : b.state === 'awaiting_payment'
                      ? 'Awaiting payment'
                      : b.state === 'paid'
                        ? 'Paid'
                        : 'Cancelled'
              }
              tone={
                b.completedAt || b.state === 'paid'
                  ? 'success'
                  : b.state === 'cancelled'
                    ? 'neutral'
                    : 'warning'
              }
            />
          </View>
          <Text style={s.meta}>
            {b.buyer} · {b.purpose === 'transfer' ? 'Transfer' : 'Pick up'}
          </Text>
          <View style={s.leg}>
            <View style={s.legRail}>
              <View style={s.legDot} />
              <View style={s.legLine} />
              <View style={[s.legDot, s.legEnd]} />
            </View>
            <View style={s.grow}>
              <Text style={s.value}>{b.pickupLabel}</Text>
              <Text style={s.value}>{b.dropoffLabel}</Text>
            </View>
          </View>
          <Text style={s.meta}>
            {new Date(b.pickupAt).toLocaleString('en-GH')}
            {b.bookedHours ? ` · ${hoursLabel(b.bookedHours)}` : ''}
          </Text>
          {b.startedAt ? (
            <Text style={s.meta}>
              On the clock {elapsedLabel(b.startedAt, b.completedAt)}
              {b.bookedHours ? ` of ${hoursLabel(b.bookedHours)} booked` : ''}.
            </Text>
          ) : null}
          <View style={s.driver}>
            <Icon name="truck" size={16} color={b.driverName ? colors.brandInk : colors.harvestInk} />
            <Text style={[s.value, s.grow]}>
              {b.driverName || b.driverPlate
                ? `${b.driverName || 'Assigned'}${b.driverPlate ? ` · ${b.driverPlate}` : ''}`
                : 'No driver allotted yet'}
            </Text>
          </View>
          {b.state !== 'cancelled' && !b.startedAt ? (
            <AssignDriver booking={b} currentId={b.driverId} run={run} />
          ) : null}
          {b.state === 'awaiting_payment' ? (
            <View style={s.actions}>
              <Input
                label="Fare (GH₵)"
                value={fares[b.id] ?? ''}
                onChangeText={(v) => setFares({ ...fares, [b.id]: v })}
                keyboardType="decimal-pad"
              />
              <Button
                size="sm"
                variant="outline"
                label="Set fare"
                loading={busy}
                disabled={!Number(fares[b.id])}
                onPress={() => run(() => saveTruckFare(b.id, Number(fares[b.id])))}
              />
              <Button
                size="sm"
                label="Confirm payment"
                loading={busy}
                onPress={() => run(() => confirmTruckPayment(b.id))}
              />
              <Button
                size="sm"
                variant="outline"
                label="Cancel booking"
                loading={busy}
                onPress={() => run(() => cancelOpsTruckBooking(b.id))}
              />
            </View>
          ) : null}
        </Card>
        </Reveal>
      ))}
      </View>
    </View>
  );
}

function AssignDriver({
  booking,
  currentId,
  run,
}: {
  booking: OpsTruckBooking;
  currentId: string;
  run: (fn: () => Promise<void>) => void;
}) {
  const s = useThemedStyles(styles);
  const [open, setOpen] = useState(false);
  const [drivers, setDrivers] = useState<TruckDriverOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const labelOf = (d: TruckDriverOption) =>
    [d.name, d.vehicle, d.plate].filter(Boolean).join(' · ') || d.id;
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
      <Button
        size="sm"
        variant="outline"
        label={
          open
            ? 'Hide drivers'
            : currentId || booking.driverName
              ? 'Change driver'
              : 'Allot a driver'
        }
        onPress={() => setOpen((v) => !v)}
      />
      {open ? (
        <>
          {loadError ? <Banner text={loadError} /> : null}
          {drivers && free.length === 0 ? (
            <Banner
              tone="info"
              text="No driver is free for this window. Invite a driver on Team, or wait until an overlapping trip ends."
            />
          ) : null}
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
          {(drivers ?? [])
            .filter((d) => !d.available)
            .map((d) => (
              <Text key={d.id} style={s.meta}>
                Busy · {labelOf(d)}
              </Text>
            ))}
        </>
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 16 },
  form: { gap: 12 },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 14, alignItems: 'flex-start' as const },
  cell: { flexGrow: 1, flexBasis: 360 },
  grow: { flex: 1, gap: 2 },
  rateRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'flex-end' as const,
    gap: 8,
    alignSelf: 'stretch' as const,
  },
  rateName: { minWidth: 72, paddingBottom: 14 },
  rateInput: { flex: 1, minWidth: 110 },
  addRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  item: { gap: 8, alignItems: 'flex-start' as const, padding: 18 },
  leg: { flexDirection: 'row' as const, gap: 10, alignSelf: 'stretch' as const },
  legRail: { alignItems: 'center' as const, paddingVertical: 6, width: 12 },
  legDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.brand600 },
  legEnd: { backgroundColor: c.harvestFill },
  legLine: { flex: 1, width: 2, marginVertical: 2, backgroundColor: c.borderSubtle },
  driver: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    alignSelf: 'stretch' as const,
    padding: 10,
    borderRadius: 12,
    backgroundColor: c.surfaceSunken,
  },
  value: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  top: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: 8,
    alignSelf: 'stretch' as const,
  },
  actions: { gap: 8, alignSelf: 'stretch' as const },
  title: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
