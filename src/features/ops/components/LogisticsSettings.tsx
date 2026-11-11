import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { fetchLogistics, saveLogistics, type Logistics } from '../../../services/ops.control.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { useAction } from './useAction';

/** Each field with its unit, allowed range (same as the database checks) and what it changes. */
const FIELDS: { key: keyof Logistics; label: string; min: number; max: number; help: string }[] = [
  { key: 'dispatchWaitMinutes', label: 'Wait for the truck to fill (minutes)', min: 0, max: 1440, help: 'A load leaves when the truck is full or the oldest order has waited this long. 0 sends every order at once.' },
  { key: 'detourKm', label: 'Detour limit (km)', min: 0, max: 500, help: 'How far off its route a truck may go for a new order or a top-up after a short pickup.' },
  { key: 'pickupTolerancePct', label: 'Pickup tolerance (%)', min: 0, max: 50, help: 'A pickup this close to the reserved quantity needs no top-up and no refund.' },
  { key: 'avgSpeedKmh', label: 'Average speed for estimates (km/h)', min: 5, max: 120, help: 'Used for arrival times until Google’s time arrives.' },
  { key: 'roadFactor', label: 'Road factor for estimates', min: 1, max: 3, help: 'Road distance compared with a straight line. 1.4 means roads are 40% longer.' },
  { key: 'stopMinutes', label: 'Time at each stop (minutes)', min: 0, max: 240, help: 'Loading or unloading time added at every farm and buyer.' },
  { key: 'etaBufferPct', label: 'Arrival buffer (%)', min: 0, max: 200, help: 'Added to every drive time so arrivals are not promised too early.' },
];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ok = (v: string, min: number, max: number) => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;

/** Dispatch, routing and pickup rules ops can change without a developer. Changes apply within 5 minutes. */
export function LogisticsSettings({ rev }: { rev: number }) {
  const s = useThemedStyles(styles);
  const [base, setBase] = useState<Logistics | null>(null);
  const [v, setV] = useState<Logistics | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetchLogistics().then((r) => { if (live) { setBase(r); setV(r); setLoadError(null); } }, (e: unknown) => {
      if (live) setLoadError(e instanceof Error ? e.message : 'Could not load the logistics settings.');
    });
    return () => { live = false; };
  }, [rev, tick]);
  const { busy, error, run } = useAction(async () => setTick((n) => n + 1));

  if (!v || !base) return loadError ? <Banner text={loadError} /> : null;
  const hoursOk = TIME.test(v.dispatchStart) && TIME.test(v.dispatchEnd) && v.dispatchStart < v.dispatchEnd;
  const valid = hoursOk && FIELDS.every((f) => ok(v[f.key], f.min, f.max));
  const dirty = (Object.keys(v) as (keyof Logistics)[]).some((k) => v[k] !== base[k]);
  const set = (k: keyof Logistics) => (x: string) => { setSaved(false); setV({ ...v, [k]: x }); };

  return (
    <Card style={s.form}>
      <Text style={s.title}>Logistics</Text>
      <Text style={s.meta}>How orders are grouped onto trucks, routed and timed. Changes are recorded and apply within 5 minutes.</Text>
      {error ? <Banner text={error} /> : null}
      <View style={s.row}>
        <Input label="Dispatch from (HH:MM)" value={v.dispatchStart} onChangeText={set('dispatchStart')} maxLength={5} style={s.half}
          error={TIME.test(v.dispatchStart) ? undefined : 'Use 24-hour time, e.g. 06:00'} />
        <Input label="Dispatch until (HH:MM)" value={v.dispatchEnd} onChangeText={set('dispatchEnd')} maxLength={5} style={s.half}
          error={!TIME.test(v.dispatchEnd) ? 'Use 24-hour time, e.g. 17:00' : !hoursOk ? 'Must be after the start' : undefined} />
      </View>
      <Text style={s.meta}>Trucks are only sent out between these times (Accra time).</Text>
      {FIELDS.map((f) => (
        <Input key={f.key} label={f.label} value={v[f.key]} onChangeText={set(f.key)} keyboardType="decimal-pad" hint={f.help}
          error={ok(v[f.key], f.min, f.max) ? undefined : `Between ${f.min} and ${f.max}`} />
      ))}
      {saved ? <Banner tone="info" text="Saved. The next planning run uses these values." /> : null}
      <View style={s.row}>
        {dirty ? <Button label="Discard" variant="ghost" onPress={() => setV(base)} /> : null}
        <Button label="Save logistics" loading={busy} disabled={!valid || !dirty} onPress={() => run(async () => { await saveLogistics(v); setSaved(true); })} />
      </View>
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  form: { gap: 12 },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  half: { flex: 1, minWidth: 140 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
