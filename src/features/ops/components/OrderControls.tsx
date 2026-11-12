import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import {
  cancelLine, completeStop, correctPickup, fetchActivity, reassignOrder, resourceLine, type Activity,
} from '../../../services/ops.control.service';
import type { BoardOrder, BoardStop, DriverRoute } from '../../../services/ops.fulfilment.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { posthog } from '../../../config/posthog';
import { when } from './OpsBits';
import { useAction } from './useAction';

const WAITING = 'Back to waiting';
type Open = { stop: string; kind: 'complete' | 'correct' } | null;

/** Manual fixes for one order. Every action needs a reason and is kept in the activity log. */
export function OrderControls({ order: o, drivers, onChange }: { order: BoardOrder; drivers: DriverRoute[]; onChange: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState(WAITING);
  const [warning, setWarning] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [kg, setKg] = useState('');
  const [temp, setTemp] = useState('');
  const [log, setLog] = useState<Activity[] | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  const why = reason.trim();
  const pending = o.stops.filter((p) => p.state === 'pending');
  const collected = o.stops.some((p) => p.state === 'done');
  const delivered = o.stops.some((p) => p.kind === 'dropoff' && p.state === 'done');
  const label = (d: DriverRoute) => `${d.name}${d.vehicle ? ` · ${d.vehicle}` : ''}`;
  const act = (action: string, fn: () => Promise<unknown>) => run(async () => {
    await fn();
    posthog?.capture('order_fulfilment_override_applied', { action });
    setReason('');
    setOpen(null);
    setKg('');
    setTemp('');
  });
  const showLog = async () => {
    try { setLog(await fetchActivity(o.id)); setLogError(null); } catch (e) { setLogError(e instanceof Error ? e.message : 'Could not load the activity log.'); }
  };

  const stopRow = (p: BoardStop) => {
    const isOpen = open?.stop === p.id;
    return (
      <View key={p.id} style={s.stop}>
        <Text style={s.value}>{p.label}</Text>
        <View style={s.row}>
          {p.state === 'pending' && p.kind === 'pickup' ? (
            <>
              <Button size="sm" variant="outline" label="Take from another farm" disabled={!why || busy} onPress={() => act('resourced_from_another_farm', () => resourceLine(p.id, why))} />
              <Button size="sm" variant="ghost" label="Cancel as short" disabled={!why || busy} onPress={() => act('line_cancelled_as_short', () => cancelLine(p.id, why))} />
            </>
          ) : null}
          {p.state === 'pending' && p.driver ? <Button size="sm" variant="outline" label="Complete for driver" onPress={() => setOpen(isOpen ? null : { stop: p.id, kind: 'complete' })} /> : null}
          {p.state === 'done' && p.kind === 'pickup' && !delivered ? <Button size="sm" variant="outline" label="Correct quantity" onPress={() => setOpen(isOpen ? null : { stop: p.id, kind: 'correct' })} /> : null}
        </View>
        {isOpen ? (
          <View style={s.row}>
            {p.kind === 'pickup' ? <Input label={`Quantity (${p.unit})`} value={kg} onChangeText={setKg} keyboardType="decimal-pad" style={s.field} /> : null}
            {open?.kind === 'complete' ? <Input label="Temperature (°C)" value={temp} onChangeText={setTemp} keyboardType="numbers-and-punctuation" style={s.field} /> : null}
            <Button size="sm" label={open?.kind === 'complete' ? 'Complete stop' : 'Save correction'} loading={busy}
              disabled={!why || (p.kind === 'pickup' && kg.trim() === '') || (open?.kind === 'complete' && temp.trim() === '')}
              onPress={() => act(open?.kind === 'complete' ? 'stop_completed' : 'pickup_corrected', () => (open?.kind === 'complete'
                ? completeStop(p.id, p.kind === 'pickup' ? Number(kg) : null, Number(temp), why)
                : correctPickup(p.id, Number(kg), why)))} />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={s.wrap}>
      <Text style={s.sub}>Fix this order</Text>
      <Input label="Reason (kept in the activity log)" value={reason} onChangeText={setReason} maxLength={280} placeholder="e.g. Driver's phone is dead, confirmed by call" />
      {error ? <Banner text={error} /> : null}
      {warning ? <Banner tone="info" text={warning} /> : null}

      {pending.length > 0 && !collected ? (
        <View style={s.stop}>
          <ChoiceChips label="Move to" options={[WAITING, ...drivers.map(label)]} value={target} onChange={setTarget} />
          <Button size="sm" variant="outline" label={target === WAITING ? 'Send back to waiting' : 'Move to this truck'} disabled={!why || busy}
            onPress={() => act(target === WAITING ? 'returned_to_waiting' : 'reassigned_to_driver', async () => setWarning(await reassignOrder(o.id, drivers.find((d) => label(d) === target)?.id ?? null, why)))} />
        </View>
      ) : null}
      {o.stops.map(stopRow)}

      {log ? (
        <View style={s.stop}>
          <Text style={s.sub}>Activity</Text>
          {log.map((a, i) => (
            <Text key={i} style={s.meta}>{when(a.at)} · {a.what}{a.who ? ` · by ${a.who}` : ''}{a.why ? ` · “${a.why}”` : ''}</Text>
          ))}
        </View>
      ) : <Button size="sm" variant="ghost" label="Show activity log" onPress={showLog} />}
      {logError ? <Banner text={logError} /> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  stop: { gap: 6 },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, alignItems: 'flex-end' as const, gap: 8 },
  field: { minWidth: 120, flex: 1 },
  sub: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  value: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
