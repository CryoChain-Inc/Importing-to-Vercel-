import { caller, cors, json, mutateWorkspace } from '../_shared/db.ts';

const BANK: Record<string, string> = { MTN: 'MTN', Telecel: 'VOD', AirtelTigo: 'ATL' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const who = await caller(req);
  if (who.error) return who.error;
  if (who.profile.role !== 'ops') return json({ error: 'Operations only.' }, 403);
  const secret = Deno.env.get('FLW_SECRET_KEY');
  if (!secret) return json({ error: 'Add FLW_SECRET_KEY before executing a payout. Nothing is marked paid without Flutterwave.' }, 503);
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  const { data: row } = await who.admin.from('workspace').select('state').eq('id', 1).single();
  const state = row?.state as {
    transfers?: { id: string; status: string; farmerId: string; momo: string; network: string; amount: number; idempotencyKey: string; attempts: number }[];
    farmers?: { id: string; name: string; walletBad?: boolean }[];
  } | undefined;
  const transfer = state?.transfers?.find(t => t.id === id);
  if (!transfer) return json({ error: 'Transfer not found.' }, 404);
  if (transfer.status === 'succeeded' || transfer.status === 'manual' || transfer.status === 'sent') return json({ ok: true, status: transfer.status });
  const farmer = state?.farmers?.find(f => f.id === transfer.farmerId);
  if (!farmer) return fail(who.admin, id, 'Farmer record missing');
  if (farmer.walletBad) return fail(who.admin, id, 'Wallet number not registered on network');
  const res = await fetch('https://api.flutterwave.com/v3/transfers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      account_bank: BANK[transfer.network] ?? transfer.network,
      account_number: transfer.momo,
      amount: transfer.amount,
      currency: 'GHS',
      narration: 'CryoChain farmer payout',
      reference: transfer.idempotencyKey,
      beneficiary_name: farmer.name,
      meta: { transfer_id: transfer.id },
    }),
  });
  const raw = await res.json().catch(() => ({}));
  const status = String(raw?.data?.status ?? '').toUpperCase();
  if (!res.ok || raw?.status === 'error') return fail(who.admin, id, raw?.message ?? 'Flutterwave rejected the transfer.');
  await mutateWorkspace(who.admin, (doc) => {
    const list = doc.transfers as { id: string; status: string; providerRef?: string; at?: number; attempts: number }[];
    const rowT = list.find(t => t.id === id);
    if (!rowT || rowT.status === 'succeeded') return;
    rowT.attempts += 1;
    rowT.providerRef = String(raw?.data?.id ?? raw?.data?.reference ?? '');
    rowT.at = Date.now();
    if (status === 'SUCCESSFUL') markPaid(doc, id, rowT.providerRef);
    else rowT.status = 'sent';
  });
  return json({ ok: true, status: status === 'SUCCESSFUL' ? 'succeeded' : 'sent' });
});

function markPaid(doc: Record<string, unknown>, transferId: string, ref: string) {
  const transfers = doc.transfers as { id: string; status: string; settlementId: string; amount: number; runId: string; farmerId: string; momo: string; providerRef?: string; at?: number }[];
  const transfer = transfers.find(t => t.id === transferId);
  if (!transfer) return;
  transfer.status = 'succeeded';
  transfer.providerRef = ref;
  const settlements = doc.settlements as { id: string; status: string }[];
  const settlement = settlements.find(s => s.id === transfer.settlementId);
  if (settlement) settlement.status = 'paid';
  const ledger = doc.ledger as Record<string, unknown>[];
  if (!ledger.some(l => l.transferId === transferId)) {
    const seq = Number(doc.seq ?? 1000) + 1;
    doc.seq = seq;
    ledger.unshift({ id: `LG-${seq}`, kind: 'payout_out', direction: 'out', amount: transfer.amount, ref, settlementId: transfer.settlementId, transferId, at: Date.now(), by: `Payout run ${transfer.runId}` });
  }
  const runs = doc.payoutRuns as { id: string; transferIds: string[]; status: string; executedAt?: number }[];
  const run = runs.find(r => r.id === transfer.runId);
  if (run) {
    const mine = transfers.filter(t => run.transferIds.includes(t.id));
    if (mine.every(t => t.status === 'succeeded' || t.status === 'manual')) run.status = 'completed';
    else if (mine.some(t => t.status === 'queued' || t.status === 'sent')) run.status = 'executing';
    else run.status = 'partial';
    run.executedAt = run.executedAt ?? Date.now();
  }
}

async function fail(admin: { from: (t: string) => unknown }, id: string, error: string) {
  await mutateWorkspace(admin as never, (doc) => {
    const transfers = doc.transfers as { id: string; status: string; attempts: number; lastError?: string; settlementId: string; farmerId: string; amount: number; runId: string }[];
    const transfer = transfers.find(t => t.id === id);
    if (!transfer || transfer.status === 'succeeded') return;
    transfer.attempts += 1;
    transfer.status = 'failed';
    transfer.lastError = error;
    const settlements = doc.settlements as { id: string; status: string; deadlineAt?: number }[];
    const settlement = settlements.find(s => s.id === transfer.settlementId);
    if (settlement) settlement.status = 'failed';
    if (transfer.attempts >= 3) {
      const exceptions = doc.exceptions as Record<string, unknown>[];
      if (!exceptions.some(e => (e.entity as { id?: string } | undefined)?.id === id && e.status !== 'resolved')) {
        exceptions.unshift({
          id: `EX-${id}`,
          type: 'transfer_failed',
          severity: 'high',
          title: `Transfer failed · ${transfer.farmerId} · GHS ${transfer.amount.toFixed(2)}`,
          detail: `${error}. Three attempts made. Fix the wallet number or pay manually before the 24 hour deadline.`,
          entity: { type: 'transfer', id },
          openedAt: Date.now(),
          deadlineAt: settlement?.deadlineAt,
          status: 'open',
        });
      }
    }
  });
  return json({ ok: false, error }, 502);
}
