import React, { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Badge, Button, Card, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { fetchTrucks, saveTruck, type Truck } from '../../../services/ops.fleet.service';
import type { TeamMember } from '../../../services/ops.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone } from '../../../utils/format';
import { Empty, PanelSkeleton, Stat, StatGrid, kg } from './OpsBits';
import { useAction } from './useAction';

const NONE = 'No driver';
const BLANK = { id: undefined as string | undefined, plate: '', name: '', capacity: '1000', driverId: null as string | null, active: true };

/** The trucks CryoChain runs: plate, how much each carries, and the driver who has it. */
export function FleetPanel({ team, rev }: { team: TeamMember[]; /** Bumps when the dashboard reloads. */ rev: number }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [trucks, setTrucks] = useState<Truck[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);

  // Bumped after a save, or by "Try again", to fetch the list again.
  const [tick, setTick] = useState(0);
  const reload = async () => setTick((n) => n + 1);
  useEffect(() => {
    let live = true;
    fetchTrucks().then(
      (rows) => { if (live) { setTrucks(rows); setLoadError(null); } },
      (e: unknown) => { if (live) setLoadError(e instanceof Error ? e.message : 'Could not load the trucks.'); },
    );
    return () => { live = false; };
  }, [rev, tick]);
  const { busy, error, run } = useAction(reload);

  if (!trucks) return loadError ? <><Banner text={loadError} /><Button label="Try again" variant="outline" onPress={reload} /></> : <PanelSkeleton />;

  // A driver can hold one truck, so only free drivers (and this truck's own driver) are offered.
  const taken = new Set(trucks.filter((t) => t.driverId && t.id !== form.id).map((t) => t.driverId));
  const drivers = team.filter((m) => m.role === 'driver' && !taken.has(m.id));
  const label = (m: TeamMember) => [m.name, formatPhone(m.phone) || m.email].filter(Boolean).join(' · ');
  const capacity = Number(form.capacity);
  const plate = form.plate.trim();
  const valid = plate.length >= 2 && plate.length <= 20 && Number.isFinite(capacity) && capacity > 0 && capacity <= 50000;
  const inUse = trucks.filter((t) => t.active);

  return (
    <View style={s.list}>
      {error || loadError ? <Banner text={(error ?? loadError)!} /> : null}
      <StatGrid>
        <Stat label="Trucks in service" value={String(inUse.length)} />
        <Stat label="Total capacity" value={kg(inUse.reduce((a, t) => a + t.capacityKg, 0))} />
        <Stat label="Without a driver" value={String(inUse.filter((t) => !t.driverId).length)} tone={inUse.some((t) => !t.driverId) ? 'warn' : undefined} />
      </StatGrid>

      <Card style={s.form}>
        <Text style={s.title}>{form.id ? `Edit ${form.plate}` : 'Add a truck'}</Text>
        <Input label="Plate number" value={form.plate} onChangeText={(plate) => setForm({ ...form, plate })} autoCapitalize="characters" maxLength={20} />
        <Input label="Name or type (optional)" value={form.name} onChangeText={(name) => setForm({ ...form, name })} maxLength={60} placeholder="Cold van" />
        <Input label="Capacity (kg)" value={form.capacity} onChangeText={(capacity) => setForm({ ...form, capacity })} keyboardType="decimal-pad"
          error={form.capacity && !(capacity > 0 && capacity <= 50000) ? 'Between 1 and 50,000 kg' : undefined} />
        {form.active ? (
          <ChoiceChips label="Driver" options={[NONE, ...drivers.map(label)]}
            value={drivers.find((m) => m.id === form.driverId) ? label(drivers.find((m) => m.id === form.driverId)!) : NONE}
            onChange={(v) => setForm({ ...form, driverId: drivers.find((m) => label(m) === v)?.id ?? null })} />
        ) : null}
        {form.id ? (
          <View style={s.row}>
            <Text style={s.meta}>{form.active ? 'In service' : 'Out of service: it is taken off its driver and gets no orders.'}</Text>
            <Switch value={form.active} onValueChange={(active) => setForm({ ...form, active })} accessibilityLabel="In service"
              trackColor={{ false: colors.borderStrong, true: colors.brand600 }} thumbColor="#ffffff" />
          </View>
        ) : null}
        <View style={s.actions}>
          {form.id ? <Button label="Cancel" variant="outline" onPress={() => setForm(BLANK)} style={s.action} /> : null}
          <Button label={form.id ? 'Save truck' : 'Add truck'} loading={busy} disabled={!valid} style={s.action}
            onPress={() => run(async () => {
              await saveTruck({ id: form.id, plate, name: form.name, capacityKg: capacity, driverId: form.driverId, active: form.active });
              setForm(BLANK);
            })} />
        </View>
      </Card>

      {trucks.length === 0 ? <Empty icon="truck" title="No trucks yet" hint="Add each truck with its plate and how many kg it carries." /> : null}
      {trucks.map((t) => (
        <Card key={t.id} style={s.item}>
          <View style={s.grow}>
            <Text style={s.name}>{t.plate}{t.name ? ` · ${t.name}` : ''}</Text>
            <Text style={s.meta}>{kg(t.capacityKg)} · {t.driverName || 'No driver'}</Text>
          </View>
          <Badge label={!t.active ? 'Out of service' : t.driverId ? 'Assigned' : 'No driver'} tone={!t.active ? 'neutral' : t.driverId ? 'success' : 'warning'} />
          <Button label="Edit" variant="tonal" size="sm" icon="edit"
            onPress={() => setForm({ id: t.id, plate: t.plate, name: t.name, capacity: String(t.capacityKg), driverId: t.driverId, active: t.active })} />
        </Card>
      ))}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  form: { gap: 12 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 12 },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
  item: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, padding: 14, flexWrap: 'wrap' as const },
  grow: { flex: 1, gap: 2, minWidth: 160 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink },
  meta: { flexShrink: 1, fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
