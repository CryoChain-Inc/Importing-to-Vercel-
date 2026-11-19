import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  fetchUnitWeights,
  saveUnitWeights,
  type UnitWeights as Weights,
} from '../../../services/ops.control.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { UNITS } from '../../../utils/units';
import { SettingGroup, SettingRow } from './SettingRow';
import { useAction } from './useAction';

const valid = (v: string) => v.trim() === '' || (Number(v) > 0 && Number(v) <= 1000);

/** Estimated kilos in one unit. A truck holds kilos, so a piece or a bunch is converted before it counts against capacity. */
export function UnitWeights({ rev }: { rev: number }) {
  const s = useThemedStyles(styles);
  const [base, setBase] = useState<Weights | null>(null);
  const [v, setV] = useState<Weights>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    fetchUnitWeights().then(
      (r) => {
        if (live) {
          setBase(r);
          setV(r);
          setLoadError(null);
        }
      },
      (e: unknown) => {
        if (live) setLoadError(e instanceof Error ? e.message : 'Could not load the unit weights.');
      },
    );
    return () => {
      live = false;
    };
  }, [rev, tick]);
  const { busy, error, run } = useAction(async () => setTick((n) => n + 1));

  if (!base) return loadError ? <Banner text={loadError} /> : null;
  const dirty = UNITS.some((u) => (v[u] ?? '') !== (base[u] ?? ''));
  const ok = UNITS.every((u) => valid(v[u] ?? ''));
  return (
    <Card style={s.form}>
      <Text style={s.title}>Truck load estimates</Text>
      <Text style={s.meta}>
        Trucks hold kilos, so set what one unit weighs. A product can override this when edited.
      </Text>
      {error ? <Banner text={error} /> : null}
      <SettingGroup
        title="Weight per unit"
        summary={UNITS.map((u) => `${u} ${v[u] || 1}`).join(' · ')}
        invalid={!ok}
      >
        {UNITS.map((u) => (
          <SettingRow
            key={u}
            label={`1 ${u} weighs`}
            unit="kg"
            value={v[u] ?? ''}
            onChangeText={(x) => {
              setSaved(false);
              setV({ ...v, [u]: x });
            }}
            maxLength={7}
            help="Left empty, it counts as 1 kg."
            error={valid(v[u] ?? '') ? undefined : 'Above 0, up to 1000'}
          />
        ))}
      </SettingGroup>
      {saved ? (
        <Banner tone="info" text="Saved. The next planning run uses these weights." />
      ) : null}
      {dirty ? (
        <View style={s.grid}>
          <Button label="Discard" variant="ghost" onPress={() => setV(base)} />
          <Button
            label="Save weights"
            loading={busy}
            disabled={!ok || !dirty}
            onPress={() =>
              run(async () => {
                await saveUnitWeights(UNITS, v);
                setSaved(true);
              })
            }
          />
        </View>
      ) : null}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  form: { gap: 12 },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
