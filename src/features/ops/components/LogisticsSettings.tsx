import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  fetchLogistics,
  saveLogistics,
  type Logistics,
} from '../../../services/ops.control.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { SettingGroup, SettingRow } from './SettingRow';
import { UnitWeights } from './UnitWeights';
import { useAction } from './useAction';

/** Each field with its unit, allowed range (same as the database checks) and what it changes. */
const FIELDS: {
  key: keyof Logistics;
  label: string;
  unit: string;
  min: number;
  max: number;
  help: string;
}[] = [
  {
    key: 'dispatchWaitMinutes',
    label: 'Wait for truck space',
    unit: 'min',
    min: 0,
    max: 1440,
    help: 'When every truck is full or offline, an order waits this long, then comes to you to assign.',
  },
  {
    key: 'detourKm',
    label: 'Detour limit',
    unit: 'km',
    min: 0,
    max: 500,
    help: 'How far off route a truck may go for a new order or a top-up.',
  },
  {
    key: 'pickupTolerancePct',
    label: 'Pickup tolerance',
    unit: '%',
    min: 0,
    max: 50,
    help: 'A pickup this close to the reserved quantity needs no top-up or refund.',
  },
  {
    key: 'avgSpeedKmh',
    label: 'Average speed',
    unit: 'km/h',
    min: 5,
    max: 120,
    help: 'Used for arrival times until Google’s time arrives.',
  },
  {
    key: 'roadFactor',
    label: 'Road factor',
    unit: '×',
    min: 1,
    max: 3,
    help: 'Road vs straight-line distance. 1.4 means roads are 40% longer.',
  },
  {
    key: 'stopMinutes',
    label: 'Time at each stop',
    unit: 'min',
    min: 0,
    max: 240,
    help: 'Loading or unloading time at every farm and buyer.',
  },
  {
    key: 'etaBufferPct',
    label: 'Arrival buffer',
    unit: '%',
    min: 0,
    max: 200,
    help: 'Added to every drive time so arrivals are not promised too early.',
  },
];
const GROUPS: { title: string; keys: (keyof Logistics)[] }[] = [
  { title: 'Pickups', keys: ['detourKm', 'pickupTolerancePct'] },
  {
    title: 'Arrival estimates',
    keys: ['avgSpeedKmh', 'roadFactor', 'stopMinutes', 'etaBufferPct'],
  },
];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ok = (v: string, min: number, max: number) =>
  v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max;

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
    fetchLogistics().then(
      (r) => {
        if (live) {
          setBase(r);
          setV(r);
          setLoadError(null);
        }
      },
      (e: unknown) => {
        if (live)
          setLoadError(e instanceof Error ? e.message : 'Could not load the logistics settings.');
      },
    );
    return () => {
      live = false;
    };
  }, [rev, tick]);
  const { busy, error, run } = useAction(async () => setTick((n) => n + 1));

  if (!v || !base) return loadError ? <Banner text={loadError} /> : null;
  const hoursOk =
    TIME.test(v.dispatchStart) && TIME.test(v.dispatchEnd) && v.dispatchStart < v.dispatchEnd;
  const valid = hoursOk && FIELDS.every((f) => ok(v[f.key], f.min, f.max));
  const dirty = (Object.keys(v) as (keyof Logistics)[]).some((k) => v[k] !== base[k]);
  const set = (k: keyof Logistics) => (x: string) => {
    setSaved(false);
    setV({ ...v, [k]: x });
  };

  const row = (f: (typeof FIELDS)[number]) => (
    <SettingRow
      key={f.key}
      label={f.label}
      unit={f.unit}
      help={f.help}
      value={v[f.key]}
      onChangeText={set(f.key)}
      error={ok(v[f.key], f.min, f.max) ? undefined : `Between ${f.min} and ${f.max}`}
    />
  );

  return (
    <View style={s.stack}>
      <Card style={s.form}>
        <Text style={s.title}>Logistics</Text>
        <Text style={s.meta}>
          How orders are grouped, routed and timed. Changes apply within 5 minutes.
        </Text>
        {error ? <Banner text={error} /> : null}
        <SettingGroup
          title="Dispatch"
          summary={`${v.dispatchStart}–${v.dispatchEnd} · wait ${v.dispatchWaitMinutes} min`}
          invalid={!hoursOk || !ok(v.dispatchWaitMinutes, 0, 1440)}
        >
          <SettingRow
            label="Send trucks from"
            help="Trucks only go out in this window (Accra time, 24-hour)."
            placeholder="06:00"
            keyboardType="numbers-and-punctuation"
            value={v.dispatchStart}
            onChangeText={set('dispatchStart')}
            maxLength={5}
            error={TIME.test(v.dispatchStart) ? undefined : 'Use 24-hour time, e.g. 06:00'}
          />
          <SettingRow
            label="Stop sending at"
            placeholder="17:00"
            keyboardType="numbers-and-punctuation"
            value={v.dispatchEnd}
            onChangeText={set('dispatchEnd')}
            maxLength={5}
            error={
              !TIME.test(v.dispatchEnd)
                ? 'Use 24-hour time, e.g. 17:00'
                : !hoursOk
                  ? 'Must be after the start'
                  : undefined
            }
          />
          {row(FIELDS[0])}
        </SettingGroup>
        {GROUPS.map((g) => {
          const fs = g.keys.map((k) => FIELDS.find((f) => f.key === k)!);
          return (
            <SettingGroup
              key={g.title}
              title={g.title}
              summary={fs.map((f) => `${v[f.key]} ${f.unit}`).join(' · ')}
              invalid={fs.some((f) => !ok(v[f.key], f.min, f.max))}
            >
              {fs.map(row)}
            </SettingGroup>
          );
        })}
        {saved ? (
          <Banner tone="info" text="Saved. The next planning run uses these values." />
        ) : null}
        {dirty ? (
          <View style={s.row}>
            <Button label="Discard" variant="ghost" onPress={() => setV(base)} />
            <Button
              label="Save logistics"
              loading={busy}
              disabled={!valid || !dirty}
              onPress={() =>
                run(async () => {
                  await saveLogistics(v);
                  setSaved(true);
                })
              }
            />
          </View>
        ) : null}
      </Card>
      <UnitWeights rev={rev} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  stack: { gap: 16 },
  form: { gap: 14 },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
