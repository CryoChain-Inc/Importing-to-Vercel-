import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Icon, Input } from '../../../components/common';
import { Banner, Reveal } from '../../../components/feedback';
import { fetchTrucks, saveTruck, type Truck } from '../../../services/ops.fleet.service';
import type { TeamMember } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone } from '../../../utils/format';
import { Empty, PanelSkeleton, SectionTitle, Stat, StatGrid, kg } from './OpsBits';
import { useAction } from './useAction';

const NONE = 'No driver';
const BLANK = {
  id: undefined as string | undefined,
  plate: '',
  name: '',
  capacity: '1000',
  driverId: null as string | null,
  active: true,
};

/** The trucks CryoChain runs: plate, how much each carries, and the driver who has it. */
export function FleetPanel({
  team,
  rev,
}: {
  team: TeamMember[];
  /** Bumps when the dashboard reloads. */ rev: number;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [trucks, setTrucks] = useState<Truck[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [adding, setAdding] = useState(false);

  // Bumped after a save, or by "Try again", to fetch the list again.
  const [tick, setTick] = useState(0);
  const reload = async () => setTick((n) => n + 1);
  useEffect(() => {
    let live = true;
    fetchTrucks().then(
      (rows) => {
        if (live) {
          setTrucks(rows);
          setLoadError(null);
        }
      },
      (e: unknown) => {
        if (live) setLoadError(e instanceof Error ? e.message : 'Could not load the trucks.');
      },
    );
    return () => {
      live = false;
    };
  }, [rev, tick]);
  const { busy, error, run } = useAction(reload);

  if (!trucks)
    return loadError ? (
      <>
        <Banner text={loadError} />
        <Button label="Try again" variant="outline" onPress={reload} />
      </>
    ) : (
      <PanelSkeleton variant="stats" />
    );

  // A driver can hold one truck, so only free drivers (and this truck's own driver) are offered.
  const taken = new Set(
    trucks.filter((t) => t.driverId && t.id !== form.id).map((t) => t.driverId),
  );
  const drivers = team.filter((m) => m.role === 'driver' && !taken.has(m.id));
  const label = (m: TeamMember) =>
    [m.name, formatPhone(m.phone) || m.email].filter(Boolean).join(' · ');
  const capacity = Number(form.capacity);
  const plate = form.plate.trim();
  const valid =
    plate.length >= 2 &&
    plate.length <= 20 &&
    Number.isFinite(capacity) &&
    capacity > 0 &&
    capacity <= 50000;
  const inUse = trucks.filter((t) => t.active);

  return (
    <View style={s.list}>
      {error || loadError ? <Banner text={(error ?? loadError)!} /> : null}
      <StatGrid>
        <Stat icon="truck" label="Trucks in service" value={String(inUse.length)} tone="brand" />
        <Stat
          icon="package"
          label="Total capacity"
          value={kg(inUse.reduce((a, t) => a + t.capacityKg, 0))}
        />
        <Stat
          icon="users"
          label="Without a driver"
          value={String(inUse.filter((t) => !t.driverId).length)}
          tone={inUse.some((t) => !t.driverId) ? 'warn' : undefined}
        />
      </StatGrid>

      <View style={s.row}>
        <View style={s.grow}>
          <SectionTitle title="Trucks" note="Plate, how much each carries and who drives it." />
        </View>
        {adding || form.id ? null : (
          <Button label="Add truck" icon="edit" size="sm" onPress={() => setAdding(true)} />
        )}
      </View>

      {adding || form.id ? (
        <Reveal>
          <Card style={s.form}>
            <Text style={s.title}>{form.id ? `Edit ${form.plate}` : 'Add a truck'}</Text>
            <Input
              label="Plate number"
              value={form.plate}
              onChangeText={(plate) => setForm({ ...form, plate })}
              autoCapitalize="characters"
              maxLength={20}
            />
            <Input
              label="Name or type (optional)"
              value={form.name}
              onChangeText={(name) => setForm({ ...form, name })}
              maxLength={60}
              placeholder="Cold van"
            />
            <Input
              label="Capacity (kg)"
              value={form.capacity}
              onChangeText={(capacity) => setForm({ ...form, capacity })}
              keyboardType="decimal-pad"
              error={
                form.capacity && !(capacity > 0 && capacity <= 50000)
                  ? 'Between 1 and 50,000 kg'
                  : undefined
              }
            />
            {form.active ? (
              <ChoiceChips
                label="Driver"
                options={[NONE, ...drivers.map(label)]}
                value={
                  drivers.find((m) => m.id === form.driverId)
                    ? label(drivers.find((m) => m.id === form.driverId)!)
                    : NONE
                }
                onChange={(v) =>
                  setForm({ ...form, driverId: drivers.find((m) => label(m) === v)?.id ?? null })
                }
              />
            ) : null}
            {form.id ? (
              <View style={s.row}>
                <Text style={s.meta}>
                  {form.active
                    ? 'In service'
                    : 'Out of service: it is taken off its driver and gets no orders.'}
                </Text>
                <Switch
                  value={form.active}
                  onValueChange={(active) => setForm({ ...form, active })}
                  accessibilityLabel="In service"
                  trackColor={{ false: colors.borderStrong, true: colors.brand600 }}
                  thumbColor="#ffffff"
                />
              </View>
            ) : null}
            <View style={s.actions}>
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => {
                  setForm(BLANK);
                  setAdding(false);
                }}
                style={s.action}
              />
              <Button
                label={form.id ? 'Save truck' : 'Add truck'}
                loading={busy}
                disabled={!valid}
                style={s.action}
                onPress={() =>
                  run(async () => {
                    await saveTruck({
                      id: form.id,
                      plate,
                      name: form.name,
                      capacityKg: capacity,
                      driverId: form.driverId,
                      active: form.active,
                    });
                    setForm(BLANK);
                    setAdding(false);
                  })
                }
              />
            </View>
          </Card>
        </Reveal>
      ) : null}

      {trucks.length === 0 ? (
        <Empty
          icon="truck"
          title="No trucks yet"
          hint="Add each truck with its plate and how many kg it carries."
        />
      ) : null}
      <View style={s.grid}>
        {trucks.map((t, i) => (
          <Reveal key={t.id} index={i} style={s.cell}>
            <Card style={[s.item, !t.active && s.off]}>
              <View style={s.row}>
                <View style={s.truckIcon}>
                  <Icon name="truck" size={22} color={colors.brandInk} />
                </View>
                <View style={s.grow}>
                  <Text style={s.name}>{t.plate}</Text>
                  <Text style={s.meta}>{t.name || 'Cold truck'}</Text>
                </View>
                <Badge
                  label={!t.active ? 'Out of service' : t.driverId ? 'Assigned' : 'No driver'}
                  tone={!t.active ? 'neutral' : t.driverId ? 'success' : 'warning'}
                />
              </View>
              <View style={s.facts}>
                <View style={s.fact}>
                  <Text style={s.factLabel}>Carries</Text>
                  <Text style={s.factValue}>{kg(t.capacityKg)}</Text>
                </View>
                <View style={s.fact}>
                  <Text style={s.factLabel}>Driver</Text>
                  <Text style={s.factValue} numberOfLines={1}>
                    {t.driverName || 'None'}
                  </Text>
                </View>
              </View>
              <Button
                label="Edit truck"
                variant="tonal"
                size="sm"
                icon="edit"
                onPress={() =>
                  setForm({
                    id: t.id,
                    plate: t.plate,
                    name: t.name,
                    capacity: String(t.capacityKg),
                    driverId: t.driverId,
                    active: t.active,
                  })
                }
              />
            </Card>
          </Reveal>
        ))}
      </View>
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
    alignItems: 'stretch' as const,
  },
  cell: { flexGrow: 1, flexBasis: 300 },
  off: { opacity: 0.7 },
  truckIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  facts: { flexDirection: 'row' as const, gap: 8 },
  fact: { flex: 1, gap: 2, padding: 10, borderRadius: 12, backgroundColor: c.surfaceSunken },
  factLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  factValue: {
    fontFamily: fonts.sansBold,
    fontSize: 15,
    color: c.ink,
    fontVariant: ['tabular-nums' as const],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
  },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
  item: { gap: 12, padding: 16 },
  grow: { flex: 1, gap: 2, minWidth: 160 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: {
    flexShrink: 1,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    lineHeight: 18,
    color: c.inkMuted,
  },
});
