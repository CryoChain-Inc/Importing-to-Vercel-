import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { formatPhone, ghs } from '../../../utils/format';
import { Empty, PanelSkeleton, SectionTitle, Stat, StatGrid } from './OpsBits';
import { useAction } from './useAction';

/** Hour packages and every cold-truck booking. Operations allots a driver from who is free. */
export function TrucksPanel() {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [rates, setRates] = useState<TruckHourRate[]>([]);
  const [adding, setAdding] = useState(false);
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
  const taken = rates.some((r) => r.hours === Number(hours));
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
          <View style={s.top}>
            <View style={s.grow}>
              <Text style={s.title}>Hour packages</Text>
              <Text style={s.meta}>
                Buyers pick one. The fare is the package price, not kilometres.
              </Text>
            </View>
            <Badge label={`${rates.length} active`} tone="info" />
          </View>
          <View style={s.pkgList}>
            {[...rates]
              .sort((x, y) => x.hours - y.hours)
              .map((r, i) => (
                <PackageRow key={r.id + r.price} rate={r} first={i === 0} busy={busy} run={run} />
              ))}
            {rates.length === 0 ? (
              <Text style={[s.meta, s.pkgEmpty]}>No packages yet. Add one so buyers can book.</Text>
            ) : null}
          </View>
          {adding ? (
            <View style={s.addBox}>
              <Text style={s.value}>New package</Text>
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
              {taken ? (
                <Text style={s.meta}>A {hoursLabel(Number(hours))} package already exists.</Text>
              ) : Number(hours) > 0 && Number(price) > 0 ? (
                <Text style={s.meta}>
                  {hoursLabel(Number(hours))} at {ghs(Number(price) / Number(hours))} per hour
                </Text>
              ) : null}
              <View style={s.addRow}>
                <Button
                  size="sm"
                  label="Add package"
                  loading={busy}
                  disabled={!Number(hours) || !Number(price) || taken}
                  onPress={() =>
                    run(async () => {
                      await addHourRate(Number(hours), Number(price));
                      setHours('');
                      setPrice('');
                      setAdding(false);
                    })
                  }
                />
                <Button size="sm" variant="ghost" label="Cancel" onPress={() => setAdding(false)} />
              </View>
            </View>
          ) : (
            <Button variant="outline" label="Add hour package" onPress={() => setAdding(true)} />
          )}
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
                <View style={s.grow}>
                  <Text style={s.name}>{b.code}</Text>
                  <Text style={s.meta}>
                    {b.buyer}
                    {b.buyerPhone ? ` · ${formatPhone(b.buyerPhone)}` : ''}
                  </Text>
                </View>
                <View style={s.right}>
                  <Text style={s.amount}>{ghs(b.amount)}</Text>
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
              </View>
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
              <View style={s.facts}>
                <Fact
                  label="Pickup"
                  value={new Date(b.pickupAt).toLocaleString('en-GH', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                />
                <Fact label="Type" value={b.purpose === 'transfer' ? 'Transfer' : 'Pick up'} />
                {b.bookedHours ? (
                  <Fact
                    label="Package"
                    value={`${hoursLabel(b.bookedHours)}${b.hourlyPrice ? ` · ${ghs(b.hourlyPrice)}/h` : ''}`}
                  />
                ) : null}
                {b.distanceKm ? (
                  <Fact label="Distance" value={`${b.distanceKm.toFixed(1)} km`} />
                ) : null}
                {b.startedAt ? (
                  <Fact
                    label="On the clock"
                    value={`${elapsedLabel(b.startedAt, b.completedAt)}${b.bookedHours ? ` of ${hoursLabel(b.bookedHours)}` : ''}`}
                  />
                ) : null}
                <Fact
                  label="Booked"
                  value={new Date(b.createdAt).toLocaleDateString('en-GH', { dateStyle: 'medium' })}
                />
              </View>
              <View style={s.driver}>
                <Icon
                  name="truck"
                  size={16}
                  color={b.driverName ? colors.brandInk : colors.harvestInk}
                />
                <View style={s.grow}>
                  <Text style={s.value}>
                    {b.driverName || b.driverPlate
                      ? b.driverName || 'Assigned'
                      : 'No driver allotted yet'}
                  </Text>
                  {b.driverName || b.driverPlate ? (
                    <Text style={s.meta}>
                      {[b.driverPlate, b.driverVehicle, b.driverPhone && formatPhone(b.driverPhone)]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  ) : null}
                </View>
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

function PackageRow({
  rate,
  first,
  busy,
  run,
}: {
  rate: TruckHourRate;
  first: boolean;
  busy: boolean;
  run: (fn: () => Promise<void>) => void;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(rate.price));
  const next = Number(val);
  return (
    <View style={[s.pkg, !first && s.pkgDivider]}>
      <View style={s.pkgHead}>
        <View style={s.grow}>
          <Text style={s.name}>{hoursLabel(rate.hours)}</Text>
          <Text style={s.meta}>{ghs(rate.price / rate.hours)} per hour</Text>
        </View>
        {!editing ? (
          <>
            <Text style={s.amount}>{ghs(rate.price)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${hoursLabel(rate.hours)} price`}
              onPress={() => setEditing(true)}
              style={s.iconBtn}
            >
              <Icon name="edit" size={18} color={colors.inkMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${hoursLabel(rate.hours)} package`}
              disabled={busy}
              onPress={() => run(() => deleteHourRate(rate.id))}
              style={s.iconBtn}
            >
              <Icon name="trash" size={18} color={colors.dangerInk} />
            </Pressable>
          </>
        ) : null}
      </View>
      {editing ? (
        <View style={s.addRow}>
          <Input
            label="Price (GH₵)"
            value={val}
            onChangeText={setVal}
            keyboardType="decimal-pad"
            style={s.rateInput}
          />
          <Button
            size="sm"
            label="Save"
            loading={busy}
            disabled={!(next > 0) || next === rate.price}
            onPress={() => run(() => saveHourRate(rate.id, next))}
          />
          <Button
            size="sm"
            variant="ghost"
            label="Cancel"
            onPress={() => {
              setVal(String(rate.price));
              setEditing(false);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.fact}>
      <Text style={s.meta}>{label}</Text>
      <Text style={s.value}>{value}</Text>
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
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 14,
    alignItems: 'flex-start' as const,
  },
  cell: { flexGrow: 1, flexBasis: 360 },
  grow: { flex: 1, gap: 2 },
  pkgList: {
    alignSelf: 'stretch' as const,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderSubtle,
    paddingHorizontal: 14,
  },
  pkg: { paddingVertical: 12, gap: 10 },
  pkgDivider: { borderTopWidth: 1, borderTopColor: c.borderSubtle },
  pkgHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  pkgEmpty: { paddingVertical: 14 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 10,
  },
  addBox: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: c.surfaceSunken },
  right: { alignItems: 'flex-end' as const, gap: 4 },
  amount: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  facts: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 14,
    alignSelf: 'stretch' as const,
  },
  fact: { gap: 1 },
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
