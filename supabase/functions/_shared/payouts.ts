/**
 * Money-state cascades for farmer payouts. Used by `payout-transfer` (API responses) and `webhooks`
 * (Paystack events) so both paths change the record in exactly the same way.
 *
 * Every function here mutates the workspace document in place and is idempotent: calling it twice
 * for the same transfer does not add a second ledger row or SMS.
 */

export type TransferDoc = {
  id: string;
  runId: string;
  settlementId: string;
  farmerId: string;
  momo: string;
  network: string;
  amount: number;
  idempotencyKey: string;
  status: 'queued' | 'sent' | 'succeeded' | 'failed' | 'manual' | 'held';
  attempts: number;
  lastError?: string;
  providerRef?: string;
  reference?: string;
  at?: number;
  verifiedAt?: number;
};

export type FarmerDoc = {
  id: string;
  name: string;
  phone?: string;
  momo: string;
  network: string;
  walletBad?: boolean;
  momoVerified?: boolean;
  momoName?: string;
  momoVerifiedAt?: number;
  momoVerifyError?: string;
  recipientCode?: string;
};

type Doc = Record<string, unknown>;

/** Transfers that fail three times open an exception and the farmer is told the payment is delayed. */
export const MAX_ATTEMPTS = 3;

export const transfersOf = (doc: Doc) => (doc.transfers ?? []) as TransferDoc[];
export const farmersOf = (doc: Doc) => (doc.farmers ?? []) as FarmerDoc[];

function nextSeq(doc: Doc) {
  const seq = Number(doc.seq ?? 1000) + 1;
  doc.seq = seq;
  return seq;
}

const ghs = (n: number) =>
  `GHS ${Math.abs(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const maskMomo = (m: string) => `••• ••• •${m.slice(-3)}`;
const render = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/**
 * Queues an SMS the same way the app does (`QUEUED:<template>:<dedupe>` ref) so the client's
 * `drain()` sends it through `send-sms` and a replay never sends twice.
 */
function queueSms(
  doc: Doc,
  farmer: FarmerDoc | undefined,
  template: string,
  vars: Record<string, string | number>,
  dedupe: string,
) {
  if (!farmer) return;
  const list = (doc.sms ?? []) as { ref: string }[];
  const key = `${template}:${dedupe}`;
  if (list.some((m) => m.ref.endsWith(key))) return;
  const templates = ((doc.config as { smsTemplates?: Record<string, string> } | undefined)
    ?.smsTemplates ?? {}) as Record<string, string>;
  const to =
    farmer.phone ??
    `+233 ${farmer.momo.slice(1, 3)} ${farmer.momo.slice(3, 6)} ${farmer.momo.slice(6)}`;
  list.unshift({
    id: `SM-${nextSeq(doc)}`,
    to,
    farmerId: farmer.id,
    template,
    body: render(templates[template] ?? template, vars),
    at: Date.now(),
    status: 'queued',
    ref: `QUEUED:${key}`,
  } as never);
  doc.sms = list;
}

function resolveTransferExceptions(doc: Doc, transferId: string, resolution: string) {
  const exceptions = (doc.exceptions ?? []) as Record<string, unknown>[];
  exceptions.forEach((e) => {
    const entity = e.entity as { id?: string } | undefined;
    if (entity?.id === transferId && e.status !== 'resolved' && e.status !== 'dismissed') {
      e.status = 'resolved';
      e.resolution = resolution;
      e.resolvedAt = Date.now();
    }
  });
}

function openTransferException(
  doc: Doc,
  transfer: TransferDoc,
  farmer: FarmerDoc | undefined,
  detail: string,
  deadlineAt?: number,
) {
  const exceptions = (doc.exceptions ?? []) as Record<string, unknown>[];
  const open = exceptions.some((e) => {
    const entity = e.entity as { id?: string } | undefined;
    return entity?.id === transfer.id && e.status !== 'resolved' && e.status !== 'dismissed';
  });
  if (open) return;
  exceptions.unshift({
    id: `EX-${nextSeq(doc)}`,
    type: 'transfer_failed',
    severity: 'high',
    title: `Transfer failed · ${farmer?.name ?? transfer.farmerId} · ${ghs(transfer.amount)}`,
    detail,
    entity: { type: 'transfer', id: transfer.id },
    openedAt: Date.now(),
    deadlineAt,
    status: 'open',
  });
  doc.exceptions = exceptions;
}

type PayoutRunDoc = {
  id: string;
  transferIds: string[];
  status: string;
  requiresTwo?: boolean;
  approvals?: unknown[];
  executedAt?: number;
};

/** Money can move only after the run has every approval it requires. */
export function payoutMaySend(doc: Doc, runId: string) {
  const run = ((doc.payoutRuns ?? []) as PayoutRunDoc[]).find((r) => r.id === runId);
  if (!run) return false;
  if (run.status === 'cancelled' || run.status === 'draft') return false;
  const count = Array.isArray(run.approvals) ? run.approvals.length : 0;
  const need = run.requiresTwo ? 2 : 1;
  if (count >= need) return true;
  if (!run.requiresTwo && run.status !== 'pending_approval') return true;
  return false;
}

/** Recomputes the payout run's status from its transfers. */
export function settleRun(doc: Doc, runId: string) {
  const runs = (doc.payoutRuns ?? []) as PayoutRunDoc[];
  const run = runs.find((r) => r.id === runId);
  if (!run) return;
  if (run.status === 'pending_approval' || run.status === 'cancelled' || run.status === 'draft')
    return;
  const mine = transfersOf(doc).filter((t) => run.transferIds.includes(t.id));
  if (mine.every((t) => t.status === 'succeeded' || t.status === 'manual'))
    run.status = 'completed';
  else if (mine.some((t) => t.status === 'queued' || t.status === 'sent')) run.status = 'executing';
  else run.status = 'partial';
  if (run.status !== 'executing' && !run.executedAt) run.executedAt = Date.now();
}

/**
 * Transfer confirmed by Paystack: transfer paid, settlement paid, one `payout_out` ledger row,
 * farmer_paid SMS, open exceptions on this transfer resolved, run status recomputed.
 */
export function markPaid(doc: Doc, transferId: string, providerRef: string) {
  const transfer = transfersOf(doc).find((t) => t.id === transferId);
  if (!transfer || transfer.status === 'succeeded' || transfer.status === 'manual') return;
  const farmer = farmersOf(doc).find((f) => f.id === transfer.farmerId);
  transfer.status = 'succeeded';
  transfer.providerRef = providerRef;
  transfer.lastError = undefined;
  transfer.at = Date.now();
  transfer.verifiedAt = Date.now();
  const settlements = (doc.settlements ?? []) as { id: string; status: string }[];
  const settlement = settlements.find((s) => s.id === transfer.settlementId);
  if (settlement) settlement.status = 'paid';
  const ledger = (doc.ledger ?? []) as Record<string, unknown>[];
  if (!ledger.some((l) => l.transferId === transferId && l.kind === 'payout_out')) {
    ledger.unshift({
      id: `LG-${nextSeq(doc)}`,
      kind: 'payout_out',
      direction: 'out',
      amount: transfer.amount,
      ref: providerRef,
      settlementId: transfer.settlementId,
      transferId,
      at: Date.now(),
      by: `Payout run ${transfer.runId} · Paystack, verified`,
    });
    doc.ledger = ledger;
  }
  queueSms(
    doc,
    farmer,
    'farmer_paid',
    { amount: ghs(transfer.amount), masked: maskMomo(transfer.momo), ref: providerRef },
    transfer.id,
  );
  resolveTransferExceptions(doc, transferId, `Paid, ref ${providerRef}`);
  settleRun(doc, transfer.runId);
}

/**
 * Transfer did not go through. Counts an attempt, marks transfer and settlement failed, and after
 * MAX_ATTEMPTS opens a high-severity exception with the settlement deadline as its clock.
 * `countAttempt` is false when Paystack already counted this attempt (a webhook for a sent transfer).
 */
export function markFailed(doc: Doc, transferId: string, error: string, countAttempt = true) {
  const transfer = transfersOf(doc).find((t) => t.id === transferId);
  if (!transfer || transfer.status === 'succeeded' || transfer.status === 'manual') return;
  const farmer = farmersOf(doc).find((f) => f.id === transfer.farmerId);
  if (countAttempt) transfer.attempts += 1;
  transfer.status = 'failed';
  transfer.lastError = error;
  transfer.at = Date.now();
  const settlements = (doc.settlements ?? []) as {
    id: string;
    status: string;
    deadlineAt?: number;
  }[];
  const settlement = settlements.find((s) => s.id === transfer.settlementId);
  if (settlement && settlement.status !== 'paid') settlement.status = 'failed';
  if (transfer.attempts >= MAX_ATTEMPTS) {
    openTransferException(
      doc,
      transfer,
      farmer,
      `${error}. ${transfer.attempts} attempts made. Fix the wallet number or pay manually before the 24 hour deadline.`,
      settlement?.deadlineAt,
    );
    queueSms(doc, farmer, 'payout_delayed', { amount: ghs(transfer.amount) }, transfer.id);
  }
  settleRun(doc, transfer.runId);
}

/**
 * Paystack reversed a transfer it had already reported as successful. The farmer did not get the
 * money, so the settlement goes back to failed, the ledger gets an offsetting row (the original is
 * never edited), and Ops gets a high-severity exception.
 */
export function markReversedAfterSuccess(doc: Doc, transferId: string, providerRef: string) {
  const transfer = transfersOf(doc).find((t) => t.id === transferId);
  if (!transfer || transfer.status !== 'succeeded') return;
  const farmer = farmersOf(doc).find((f) => f.id === transfer.farmerId);
  transfer.status = 'failed';
  transfer.lastError = 'Paystack reversed this transfer after reporting success.';
  transfer.at = Date.now();
  const settlements = (doc.settlements ?? []) as {
    id: string;
    status: string;
    deadlineAt?: number;
  }[];
  const settlement = settlements.find((s) => s.id === transfer.settlementId);
  if (settlement) settlement.status = 'failed';
  const ledger = (doc.ledger ?? []) as Record<string, unknown>[];
  if (!ledger.some((l) => l.transferId === transferId && l.kind === 'correction')) {
    ledger.unshift({
      id: `LG-${nextSeq(doc)}`,
      kind: 'correction',
      direction: 'in',
      amount: transfer.amount,
      ref: providerRef,
      settlementId: transfer.settlementId,
      transferId,
      at: Date.now(),
      by: 'Paystack webhook, transfer.reversed',
      memo: 'Reversal of a payout previously reported as successful',
    });
    doc.ledger = ledger;
  }
  openTransferException(
    doc,
    transfer,
    farmer,
    'Paystack reversed this transfer after it was marked paid. Retry, fix the wallet, or pay manually before the deadline.',
    settlement?.deadlineAt,
  );
  settleRun(doc, transfer.runId);
}

/** Records what Paystack said about a wallet on the farmer, with a timestamp. */
export function recordWalletCheck(
  farmer: FarmerDoc,
  result: { ok: true; name: string } | { ok: false; error: string },
) {
  farmer.momoVerifiedAt = Date.now();
  if (result.ok) {
    farmer.momoName = result.name;
    farmer.momoVerified = true;
    farmer.momoVerifyError = undefined;
  } else {
    farmer.momoVerifyError = result.error;
  }
}
