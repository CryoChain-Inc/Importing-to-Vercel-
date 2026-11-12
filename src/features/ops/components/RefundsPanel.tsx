import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { approveRefund, fetchRefunds, markRefundDone, rejectRefund, type Refund, type RefundStatus } from '../../../services/ops.refunds.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { ghs } from '../../../utils/format';
import { posthog } from '../../../config/posthog';
import { Empty, PanelSkeleton, Stat, StatGrid, when } from './OpsBits';
import { useAction } from './useAction';

const LABEL: Record<RefundStatus, string> = { requested: 'Needs approval', sending: 'Sending', sent: 'With Paystack', refunded: 'Refunded', failed: 'Failed', rejected: 'Rejected' };
const TONE: Record<RefundStatus, 'warning' | 'info' | 'success' | 'neutral'> = { requested: 'warning', sending: 'info', sent: 'info', refunded: 'success', failed: 'warning', rejected: 'neutral' };
const open = (r: Refund) => r.status === 'requested' || r.status === 'failed';

/** Money owed back to buyers for produce that could not be supplied. Nothing is sent until someone here approves it. */
export function RefundsPanel({ rev }: { /** Bumps when the dashboard reloads. */ rev: number }) {
  const s = useThemedStyles(styles);
  const [refunds, setRefunds] = useState<Refund[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>({});
  // The refund whose approval is waiting for a second tap, so money never moves on one accidental press.
  const [confirm, setConfirm] = useState<string | null>(null);
  const reload = async () => setTick((n) => n + 1);
  useEffect(() => {
    let live = true;
    fetchRefunds().then(
      (rows) => { if (live) { setRefunds(rows); setLoadError(null); } },
      (e: unknown) => { if (live) setLoadError(e instanceof Error ? e.message : 'Could not load refunds.'); },
    );
    return () => { live = false; };
  }, [rev, tick]);
  const { busy, error, run } = useAction(reload);

  if (!refunds) return loadError ? <><Banner text={loadError} /><Button label="Try again" variant="outline" onPress={reload} /></> : <PanelSkeleton />;
  const sum = (rows: Refund[]) => ghs(rows.reduce((n, r) => n + r.amount, 0));

  return (
    <View style={s.list}>
      {error || loadError ? <Banner text={(error ?? loadError)!} /> : null}
      <StatGrid>
        <Stat label="Waiting for approval" value={sum(refunds.filter(open))} tone={refunds.some(open) ? 'warn' : undefined} />
        <Stat label="With Paystack" value={sum(refunds.filter((r) => r.status === 'sent' || r.status === 'sending'))} />
        <Stat label="Refunded" value={sum(refunds.filter((r) => r.status === 'refunded'))} />
      </StatGrid>
      {refunds.length === 0 ? <Empty icon="banknote" title="No refunds" hint="A refund request appears here when part of a paid order cannot be supplied." /> : null}
      {refunds.map((r) => {
        const note = notes[r.id] ?? '';
        return (
          <Card key={r.id} style={s.item}>
            <View style={s.top}>
              <Text style={s.name} numberOfLines={1}>{r.buyer} · {r.orderCode}</Text>
              <Text style={s.amount}>{ghs(r.amount)}</Text>
            </View>
            <View style={s.top}>
              <Text style={s.meta}>{r.reason}</Text>
              <Badge label={LABEL[r.status]} tone={TONE[r.status]} />
            </View>
            <Text style={s.meta}>Requested {when(r.createdAt)}{r.refundedAt ? ` · Refunded ${when(r.refundedAt)}` : ''}{r.note ? ` · ${r.note}` : ''}</Text>
            {r.status === 'failed' && r.lastError ? <Banner text={`Last attempt failed: ${r.lastError}`} /> : null}
            {open(r) ? (
              <>
                {r.online ? null : <Text style={s.meta}>This order was not paid online. Pay the buyer back by bank transfer, then record it here.</Text>}
                <Input label={r.online ? 'Note (needed to reject, or to record a refund paid by hand)' : 'How was it paid back?'} value={note}
                  onChangeText={(v) => setNotes((n) => ({ ...n, [r.id]: v }))} maxLength={280} />
                <View style={s.actions}>
                  {r.online ? (
                    confirm === r.id
                      ? <Button size="sm" variant="danger" label={`Confirm: refund ${ghs(r.amount)}`} loading={busy} onPress={() => run(async () => {
                        await approveRefund(r.id);
                        posthog?.capture('refund_approved');
                        setConfirm(null);
                      })} />
                      : <Button size="sm" label="Approve and refund" disabled={busy} onPress={() => setConfirm(r.id)} />
                  ) : null}
                  <Button size="sm" variant="outline" label="Mark as paid by hand" disabled={busy || !note.trim()} onPress={() => run(async () => {
                    await markRefundDone(r.id, note);
                    posthog?.capture('refund_manually_recorded');
                  })} />
                  <Button size="sm" variant="ghost" label="Reject" disabled={busy || !note.trim()} onPress={() => run(async () => {
                    await rejectRefund(r.id, note);
                    posthog?.capture('refund_rejected');
                  })} />
                </View>
              </>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  item: { gap: 8, padding: 16 },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8 },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  name: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, flexShrink: 1 },
  amount: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted, flexShrink: 1 },
});
