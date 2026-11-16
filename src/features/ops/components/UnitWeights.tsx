import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  fetchUnitWeights,
  saveUnitWeights,
  type UnitWeights as Weights,
} from '../../../services/ops.control.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { UNITS } from '../../../utils/units';
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
        Trucks are sized in kilos. Set about how many kilos one unit weighs so 100 pieces is not
        counted as 100 kg. A single product can override this when you edit it.
      </Text>
      {error ? <Banner text={error} /> : null}
      <View style={s.grid}>
        {UNITS.map((u) => (
          <Input
            key={u}
            label={`1 ${u} weighs (kg)`}
            value={v[u] ?? ''}
            onChangeText={(x) => {
              setSaved(false);
              setV({ ...v, [u]: x });
            }}
            keyboardType="decimal-pad"
            maxLength={7}
            style={s.cell}
            hint={(v[u] ?? '') === '' ? 'Not set: counted as 1 kg' : undefined}
            error={valid(v[u] ?? '') ? undefined : 'Above 0, up to 1000'}
          />
        ))}
      </View>
      {saved ? (
        <Banner tone="info" text="Saved. The next planning run uses these weights." />
      ) : null}
      <View style={s.grid}>
        {dirty ? <Button label="Discard" variant="ghost" onPress={() => setV(base)} /> : null}
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
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  form: { gap: 12 },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  cell: { flex: 1, minWidth: 140 },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
