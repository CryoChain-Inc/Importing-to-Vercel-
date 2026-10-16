import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import * as svc from '../../../services/ops.payouts.service';
import type { FarmerRow } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, ghs } from '../../../utils/format';
import { useAction } from './useAction';

const RUN_TONE = { review: 'warning', released: 'info', partial: 'danger', completed: 'success', cancelled: 'neutral' } as const;
const TRANSFER_TONE = { queued: 'neutral', sent: 'info', succeeded: 'success', failed: 'danger', cancelled: 'neutral' } as const;
const SETTLEMENT_TONE = { pending: 'neutral', payable: 'warning', paid: 'success' } as const;

/** Settlements -> payout runs. A run is reviewed, preflighted, approved by a second ops user when large, then released. */
export function PayoutsPanel({ settlements, runs, farmers, onChange }: {
  settlements: svc.SettlementRow[];
  runs: svc.PayoutRun[];
  farmers: FarmerRow[];
  onChange: () => Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { busy, error, run } = useAction(onChange);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const hasWallet = new Set(farmers.filter((f) => f.walletReady).map((f) => f.id));
  const eligible = settlements.filter((x) => x.status === 'payable' && !x.inRun && hasWallet.has(x.farmerId));
  const sum = (rows: svc.SettlementRow[]) => rows.reduce((n, x) => n + x.net, 0);
  const chosen = eligible.filter((x) => picked.has(x.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (!n.delete(id)) n.add(id); return n; });
  const by = (st: svc.SettlementRow['status']) => settlements.filter((x) => x.status === st);

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Text style={s.meta}>
        Pending delivery {ghs(sum(by('pending')))} · Payable {ghs(sum(by('payable')))} · Paid {ghs(sum(by('paid')))}
      </Text>

      <Text style={s.h}>Settlements</Text>
      {settlements.length === 0 ? <Card><Text style={s.meta}>No settlements yet. One is created when an agent captures a farmer’s produce.</Text></Card> : null}
      {settlements.map((x) => {
        const canPick = x.status === 'payable' && !x.inRun && hasWallet.has(x.farmerId);
        return (
          <Card key={x.id} style={s.item}>
            <View style={s.top}>
              <Text style={s.name}>{x.farmer} · {ghs(x.net)}</Text>
              <Badge label={x.inRun && x.status === 'payable' ? 'in a run' : x.status} tone={SETTLEMENT_TONE[x.status]} />
            </View>
            <Text style={s.meta}>{x.product} · lot {x.lotCode} · {new Date(x.createdAt).toLocaleDateString('en-GH')}</Text>
            {x.status === 'payable' && !x.inRun && !hasWallet.has(x.farmerId) ? <Text style={s.meta}>No MoMo wallet saved, so this cannot be paid yet.</Text> : null}
            {canPick ? <Button size="sm" variant={picked.has(x.id) ? 'tonal' : 'outline'} label={picked.has(x.id) ? 'Selected' : 'Select'} onPress={() => toggle(x.id)} /> : null}
          </Card>
        );
      })}
      {eligible.length > 0 ? (
        <View style={s.actions}>
          <Button size="sm" variant="outline" label="Select all payable" onPress={() => setPicked(new Set(eligible.map((x) => x.id)))} />
          <Button size="sm" label={`Create payout run (${chosen.length} · ${ghs(sum(chosen))})`} disabled={chosen.length === 0} loading={busy}
            onPress={() => run(async () => { await svc.createPayoutRun(chosen.map((x) => x.id)); setPicked(new Set()); })} />
        </View>
      ) : null}

      <Text style={s.h}>Payout runs</Text>
      {runs.length === 0 ? <Card><Text style={s.meta}>No payout runs yet.</Text></Card> : null}
      {runs.map((r) => <RunCard key={r.id} r={r} busy={busy} run={run} />)}
    </View>
  );
}

function RunCard({ r, busy, run }: { r: svc.PayoutRun; busy: boolean; run: (fn: () => Promise<void>) => Promise<void> }) {
  const s = useThemedStyles(styles);
  const review = r.status === 'review';
  const blocked = r.needsApproval && !r.approved;
  const pf = r.preflight;
  return (
    <Card style={s.item}>
      <View style={s.top}>
        <Text style={s.name}>{r.code} · {ghs(r.total)}</Text>
        <Badge label={r.status} tone={RUN_TONE[r.status]} />
      </View>
      <Text style={s.meta}>{r.transfers.length} farmer{r.transfers.length === 1 ? '' : 's'} · {new Date(r.createdAt).toLocaleString('en-GH')}</Text>
      {r.needsApproval ? <Badge label={r.approved ? 'Approved by a second ops user' : 'Above threshold: needs a second approver'} tone={r.approved ? 'success' : 'warning'} /> : null}
      {pf ? (
        <Text style={s.meta}>
          Preflight: needs {ghs(pf.needed)}, Paystack balance {pf.balance == null ? 'unknown' : ghs(pf.balance)}
          {pf.test ? ' (test mode, balance not enforced)' : ''}{pf.balanceOk ? '' : ' · INSUFFICIENT, top up and re-run'}
        </Text>
      ) : review ? <Text style={s.meta}>Run the preflight checks before releasing funds.</Text> : null}

      {r.transfers.map((t) => (
        <View key={t.id} style={s.transfer}>
          <View style={s.top}>
            <Text style={s.name}>{t.farmer} · {ghs(t.amount)}</Text>
            <Badge label={t.status} tone={TRANSFER_TONE[t.status]} />
          </View>
          <Text style={s.meta}>{t.network} {formatPhone(t.momoNumber)}{t.attempts ? ` · attempt ${t.attempts}` : ''}</Text>
          {t.walletCheck ? <Text style={s.meta}>{t.walletCheck === 'verified' ? `Wallet verified: ${t.walletName}` : 'Wallet name could not be verified (advisory)'}</Text> : null}
          {t.lastError && t.status === 'failed' ? <Text style={s.err}>{t.lastError}</Text> : null}
          {!review ? (
            <View style={s.actions}>
              {t.status === 'sent' ? <Button size="sm" variant="outline" label="Check with Paystack" disabled={busy} onPress={() => run(async () => { await svc.checkTransfer(t.id); })} /> : null}
              {t.status === 'failed' || t.status === 'queued' ? <Button size="sm" variant="outline" label="Retry" disabled={busy} onPress={() => run(async () => { await svc.retryTransfer(t.id); })} /> : null}
            </View>
          ) : null}
        </View>
      ))}

      {review ? (
        <View style={s.actions}>
          <Button size="sm" variant="outline" label={pf ? 'Re-run preflight' : 'Run preflight'} loading={busy} onPress={() => run(async () => { await svc.runPreflight(r.id); })} />
          {blocked ? <Button size="sm" variant="tonal" label={r.createdByMe ? 'Awaiting another approver' : 'Approve'} disabled={busy || r.createdByMe} onPress={() => run(() => svc.approvePayoutRun(r.id))} /> : null}
          <Button size="sm" label="Release funds" disabled={busy || blocked || !r.preflightAt} onPress={() => run(async () => { await svc.releaseRun(r.id); })} />
          <Button size="sm" variant="ghost" label="Cancel run" disabled={busy} onPress={() => run(() => svc.cancelPayoutRun(r.id))} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 10 },
  item: { gap: 6, alignItems: 'flex-start' as const },
  transfer: { gap: 4, alignSelf: 'stretch' as const, paddingTop: 8, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  top: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 8, alignSelf: 'stretch' as const },
  actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  h: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink, marginTop: 6 },
  name: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, flexShrink: 1 },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  err: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.dangerInk },
});
