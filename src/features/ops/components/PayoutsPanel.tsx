import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Badge, Button, Card } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import * as svc from '../../../services/ops.payouts.service';
import type { FarmerRow } from '../../../services/ops.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { formatPhone, ghs } from '../../../utils/format';
import { Empty, Hero, Segmented, usePaged } from './OpsBits';
import { useAction } from './useAction';

const RUN_TONE = { review: 'warning', released: 'info', partial: 'danger', completed: 'success', cancelled: 'neutral' } as const;
const TRANSFER_TONE = { queued: 'neutral', sent: 'info', succeeded: 'success', failed: 'danger', cancelled: 'neutral' } as const;
type Tab = 'pay' | 'runs' | 'sent' | 'waiting';

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
  const moved = (st: svc.TransferStatus) => runs.flatMap((r) => r.transfers).filter((x) => x.status === st).reduce((n, x) => n + x.amount, 0);
  const by = (st: svc.SettlementRow['status']) => settlements.filter((x) => x.status === st);

  const [tab, setTab] = useState<Tab>(eligible.length ? 'pay' : 'runs');
  const toPay = usePaged(by('payable'), 'pay');
  const sent = usePaged(by('paid'), 'sent');
  const waiting = usePaged(by('pending'), 'waiting');
  const runPage = usePaged(runs, 'runs', 3);
  const failed = moved('failed');

  return (
    <View style={s.list}>
      {error ? <Banner text={error} /> : null}
      <Hero label="Sent to farmers" value={ghs(moved('succeeded'))} cells={[
        { label: 'On the way', value: ghs(moved('sent') + moved('queued')) },
        { label: 'Ready to pay', value: ghs(sum(by('payable'))) },
      ]} />
      {failed > 0 ? <Banner text={`${ghs(failed)} in transfers failed. Open Payout runs and retry them.`} /> : null}
      <Segmented value={tab} onChange={setTab} options={[
        { key: 'pay', label: 'To pay', count: by('payable').length },
        { key: 'runs', label: 'Runs', count: runs.length },
        { key: 'sent', label: 'Sent', count: by('paid').length },
        { key: 'waiting', label: 'Waiting', count: by('pending').length },
      ]} />

      {tab === 'pay' ? (
        <>
          {by('payable').length === 0 ? <Empty icon="wallet" title="Nothing ready to pay" hint="A settlement becomes payable once a lot is collected. Payable ones can be grouped into a payout run here." /> : null}
          {toPay.rows.map((x) => {
            const canPick = !x.inRun && hasWallet.has(x.farmerId);
            return (
              <Card key={x.id} style={s.item}>
                <View style={s.top}>
                  <Text style={s.name} numberOfLines={1}>{x.farmer}</Text>
                  <Text style={s.amount}>{ghs(x.net)}</Text>
                </View>
                <Text style={s.meta}>{x.product} · lot {x.lotCode} · {new Date(x.createdAt).toLocaleDateString('en-GH')}</Text>
                {x.inRun ? <Badge label="in a run" tone="info" /> : null}
                {!x.inRun && !hasWallet.has(x.farmerId) ? <Text style={s.meta}>No MoMo wallet saved, so this cannot be paid yet.</Text> : null}
                {canPick ? <Button size="sm" variant={picked.has(x.id) ? 'tonal' : 'outline'} label={picked.has(x.id) ? 'Selected' : 'Select'} onPress={() => toggle(x.id)} /> : null}
              </Card>
            );
          })}
          {toPay.more}
          {eligible.length > 0 ? (
            <View style={s.actions}>
              <Button size="sm" variant="outline" label="Select all payable" onPress={() => setPicked(new Set(eligible.map((x) => x.id)))} />
              <Button size="sm" label={`Create payout run (${chosen.length} · ${ghs(sum(chosen))})`} disabled={chosen.length === 0} loading={busy}
                onPress={() => run(async () => { await svc.createPayoutRun(chosen.map((x) => x.id)); setPicked(new Set()); })} />
            </View>
          ) : null}
        </>
      ) : null}

      {tab === 'runs' ? (
        <>
          {runs.length === 0 ? <Empty icon="arrowUpRight" title="No payout runs yet" hint="Select payable settlements in To pay to create a run, then release the funds to the farmers’ mobile money wallets." /> : null}
          {runPage.rows.map((r) => <RunCard key={r.id} r={r} busy={busy} run={run} />)}
          {runPage.more}
        </>
      ) : null}

      {tab === 'sent' ? (
        <>
          {by('paid').length === 0 ? <Empty icon="arrowUpRight" title="Nothing sent yet" hint="Settlements show here once the farmer has been paid." /> : null}
          {sent.rows.map((x) => <SettlementLine key={x.id} x={x} note={`Paid ${x.paidAt ? new Date(x.paidAt).toLocaleString('en-GH') : ''}`} />)}
          {sent.more}
        </>
      ) : null}

      {tab === 'waiting' ? (
        <>
          {by('pending').length === 0 ? <Empty icon="truck" title="Nothing waiting" hint="Settlements wait here until the lot has been collected and delivered." /> : null}
          {waiting.rows.map((x) => <SettlementLine key={x.id} x={x} note="Waiting for collection and delivery" />)}
          {waiting.more}
        </>
      ) : null}
    </View>
  );
}

function SettlementLine({ x, note }: { x: svc.SettlementRow; note: string }) {
  const s = useThemedStyles(styles);
  return (
    <Card style={s.item}>
      <View style={s.top}>
        <Text style={s.name} numberOfLines={1}>{x.farmer}</Text>
        <Text style={s.amount}>{ghs(x.net)}</Text>
      </View>
      <Text style={s.meta}>{x.product} · lot {x.lotCode}</Text>
      <Text style={s.meta}>{note}</Text>
    </Card>
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
      <Text style={s.meta}>
        {r.transfers.length} farmer{r.transfers.length === 1 ? '' : 's'} · sent {ghs(r.transfers.filter((t) => t.status === 'succeeded').reduce((n, t) => n + t.amount, 0))} of {ghs(r.total)} · {new Date(r.createdAt).toLocaleString('en-GH')}
      </Text>
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
  name: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, flexShrink: 1 },
  amount: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink, fontVariant: ['tabular-nums' as const] },
  meta: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  err: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.dangerInk },
});
