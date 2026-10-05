import { caller, cors, json, mutateWorkspace, readWorkspace } from '../_shared/db.ts';
import {
  CONCLUSIVE,
  fromPesewas,
  ghsBalance,
  momoBankCode,
  namesLookAlike,
  paystackFetch,
  resolveWalletName,
  toPesewas,
  transferReference,
} from '../_shared/paystack.ts';
import {
  MAX_ATTEMPTS,
  farmersOf,
  markFailed,
  markPaid,
  payoutMaySend,
  recordWalletCheck,
  transfersOf,
} from '../_shared/payouts.ts';

/**
 * Farmer payouts through Paystack. Operations only.
 *
 *   { id }                         send one queued or failed transfer (default op)
 *   { op: 'verify', id }           ask Paystack for the current status of a sent transfer
 *   { op: 'preflight', runId }     balance check before a payout run executes
 *   { op: 'resolve', farmerId }    wallet name lookup, stored on the farmer
 *
 * Nothing is marked paid on the strength of an API response alone unless Paystack returns a
 * conclusive `success`; a `pending` transfer stays `sent` until the webhook or a verify call
 * confirms it.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const who = await caller(req);
  if (who.error) return who.error;
  // Financial disbursement is strictly restricted to operations roles.
  if (who.profile.role !== 'ops') return json({ error: 'Operations only.' }, 403);
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret)
    return json(
      {
        error:
          'Add PAYSTACK_SECRET_KEY before executing a payout. Nothing is marked paid without Paystack.',
      },
      503,
    );
  const body = await req.json().catch(() => ({}));
  const op = String(body.op ?? 'send');
  const admin = who.admin;
  const actor = who.profile.display_name || who.user.email || 'Operations';

  if (op === 'preflight') return preflight(admin, secret, String(body.runId ?? ''));
  if (op === 'resolve') return resolve(admin, secret, String(body.farmerId ?? ''), actor);
  if (op === 'verify') return verify(admin, secret, String(body.id ?? ''));
  return send(admin, secret, String(body.id ?? ''));
});

type Admin = Parameters<typeof mutateWorkspace>[0];

async function loadTransfer(admin: Admin, id: string) {
  const row = await readWorkspace(admin);
  if (!row) return { transfer: undefined, farmer: undefined };
  const transfer = transfersOf(row.state).find((t) => t.id === id);
  const farmer = transfer
    ? farmersOf(row.state).find((f) => f.id === transfer.farmerId)
    : undefined;
  return { transfer, farmer };
}

/**
 * Spec 8: a run does not execute against an insufficient balance. Sums what is still to be sent
 * (queued, or failed with attempts left) and compares it with the GHS balance at Paystack.
 */
async function preflight(admin: Admin, secret: string, runId: string) {
  const row = await readWorkspace(admin);
  const runs = (row?.state.payoutRuns ?? []) as { id: string; transferIds: string[] }[];
  const run = runs.find((r) => r.id === runId);
  if (!row || !run) return json({ error: 'Payout run not found.' }, 404);
  const outstanding = transfersOf(row.state)
    .filter(
      (t) =>
        run.transferIds.includes(t.id) &&
        (t.status === 'queued' ||
          t.status === 'held' ||
          (t.status === 'failed' && t.attempts < MAX_ATTEMPTS)),
    )
    .reduce((sum, t) => sum + toPesewas(t.amount), 0);
  const balance = await ghsBalance(secret);
  if (!balance.ok) return json({ ok: false, error: balance.error }, 502);
  const ok = balance.pesewas >= outstanding;
  if (!ok)
    await mutateWorkspace(admin, (doc) => {
      const audit = (doc.audit ?? []) as Record<string, unknown>[];
      audit.unshift({
        id: `AU-${Number(doc.seq ?? 1000) + 1}`,
        at: Date.now(),
        actor: 'Payout worker',
        action: 'Blocked payout run, insufficient balance',
        entity: runId,
        detail: `Paystack balance GHS ${fromPesewas(balance.pesewas).toFixed(2)}, needed GHS ${fromPesewas(outstanding).toFixed(2)}`,
      });
      doc.audit = audit;
      doc.seq = Number(doc.seq ?? 1000) + 1;
    });
  return json({
    ok,
    balance: fromPesewas(balance.pesewas),
    needed: fromPesewas(outstanding),
    error: ok
      ? undefined
      : `Paystack balance is GHS ${fromPesewas(balance.pesewas).toFixed(2)} but this run still needs GHS ${fromPesewas(outstanding).toFixed(2)}. Top up before executing.`,
  });
}

/** Wallet name lookup, recorded on the farmer with a timestamp. Does not move money. */
async function resolve(admin: Admin, secret: string, farmerId: string, actor: string) {
  const row = await readWorkspace(admin);
  const farmer = row ? farmersOf(row.state).find((f) => f.id === farmerId) : undefined;
  if (!farmer) return json({ error: 'Farmer not found.' }, 404);
  const result = await resolveWalletName(secret, farmer.momo, farmer.network);
  await mutateWorkspace(admin, (doc) => {
    const f = farmersOf(doc).find((x) => x.id === farmerId);
    if (!f) return;
    recordWalletCheck(f, result);
    const audit = (doc.audit ?? []) as Record<string, unknown>[];
    audit.unshift({
      id: `AU-${Number(doc.seq ?? 1000) + 1}`,
      at: Date.now(),
      actor,
      action: 'Checked wallet name with Paystack',
      entity: f.name,
      detail: result.ok ? `Wallet is registered to ${result.name}` : result.error,
    });
    doc.audit = audit;
    doc.seq = Number(doc.seq ?? 1000) + 1;
  });
  return json(
    result.ok
      ? { ok: true, name: result.name, match: namesLookAlike(farmer.name, result.name) }
      : { ok: false, error: result.error },
    result.ok ? 200 : 502,
  );
}

/**
 * Polls Paystack for a transfer we already sent. Used by Ops ("Check with Paystack") and by the
 * client as a safety net when a webhook has not arrived. Only a 200 with a conclusive data.status
 * changes the record.
 */
async function verify(admin: Admin, secret: string, id: string) {
  const { transfer } = await loadTransfer(admin, id);
  if (!transfer) return json({ error: 'Transfer not found.' }, 404);
  if (transfer.status === 'succeeded' || transfer.status === 'manual')
    return json({ ok: true, status: transfer.status });
  if (!transfer.reference) return json({ ok: true, status: transfer.status });
  const check = await paystackFetch(
    `/transfer/verify/${encodeURIComponent(transfer.reference)}`,
    secret,
  );
  if (!check.ok)
    return json(
      {
        ok: false,
        status: transfer.status,
        error: check.raw?.message ?? 'Paystack could not find this transfer yet.',
      },
      502,
    );
  const data = check.raw?.data ?? {};
  const status = String(data.status ?? '').toLowerCase();
  const providerRef = String(data.transfer_code ?? transfer.reference);
  if (!CONCLUSIVE.has(status)) return json({ ok: true, status: 'sent', provider: status });
  await mutateWorkspace(admin, (doc) => {
    if (status === 'success') markPaid(doc, id, providerRef);
    else markFailed(doc, id, `Paystack reported ${status}.`, false);
  });
  return json({
    ok: true,
    status: status === 'success' ? 'succeeded' : 'failed',
    provider: status,
  });
}

async function send(admin: Admin, secret: string, id: string) {
  const { transfer, farmer } = await loadTransfer(admin, id);
  if (!transfer) return json({ error: 'Transfer not found.' }, 404);
  if (transfer.status === 'succeeded' || transfer.status === 'manual')
    return json({ ok: true, status: transfer.status });
  // A sent transfer is Paystack's to finish. Re-sending would risk paying twice, so poll instead.
  if (transfer.status === 'sent') return verify(admin, secret, id);
  const row = await readWorkspace(admin);
  if (!row || !payoutMaySend(row.state, transfer.runId))
    return json(
      {
        ok: false,
        error: 'This payout is waiting for a second approver before money can be sent.',
      },
      409,
    );
  // A wallet-limit hold is released once the run is approved, so this transfer is sent.
  if (transfer.status === 'failed' && transfer.attempts >= MAX_ATTEMPTS)
    return json(
      { ok: false, status: 'failed', error: 'Attempts exhausted. Fix the wallet or pay manually.' },
      409,
    );
  if (!farmer) return fail(admin, id, 'Farmer record missing');
  if (farmer.walletBad) return fail(admin, id, 'Wallet number not registered on network');

  // 1. Wallet name lookup before the first payout to this number (spec 8, resolveWallet). A wallet
  //    change clears momoVerifiedAt on the farmer, so the new number is checked again here.
  let wallet: { ok: true; name: string } | { ok: false; error: string } | undefined;
  if (!farmer.momoVerifiedAt) wallet = await resolveWalletName(secret, farmer.momo, farmer.network);
  const walletName = wallet?.ok ? wallet.name : farmer.momoName;
  const mismatch = walletName ? !namesLookAlike(farmer.name, walletName) : false;

  // 2. Recipient. Creating one for an existing number returns the existing record, so this is safe
  //    to repeat. A rejection here means the number or telco is wrong; nothing has moved.
  const recipient = await paystackFetch('/transferrecipient', secret, {
    type: 'mobile_money',
    name: farmer.name,
    account_number: farmer.momo,
    bank_code: momoBankCode(farmer.network),
    currency: 'GHS',
    metadata: { farmer_id: farmer.id },
  });
  const recipientCode = String(recipient.raw?.data?.recipient_code ?? '');
  await mutateWorkspace(admin, (doc) => {
    const f = farmersOf(doc).find((x) => x.id === farmer.id);
    if (!f) return;
    if (wallet) recordWalletCheck(f, wallet);
    if (recipientCode) f.recipientCode = recipientCode;
    const t = transfersOf(doc).find((x) => x.id === id);
    if (t && (t.momo !== f.momo || t.network !== f.network)) {
      t.momo = f.momo;
      t.network = f.network;
    }
  });
  if (!recipient.ok || !recipientCode)
    return fail(
      admin,
      id,
      recipient.raw?.message ?? 'Paystack could not register this wallet number.',
    );
  if (mismatch)
    return fail(
      admin,
      id,
      `Wallet is registered to "${walletName}", which does not match ${farmer.name}. Confirm the number with the farmer, fix the wallet, or pay manually.`,
    );

  // 3. Transfer. `attempts` only grows after a response is processed, so a lost response reuses the
  //    same reference (Paystack de-duplicates it) while a retry after a failure gets a fresh one.
  const reference = transferReference(transfer.idempotencyKey, transfer.attempts + 1);
  await mutateWorkspace(admin, (doc) => {
    const t = transfersOf(doc).find((x) => x.id === id);
    if (t) t.reference = reference;
  });
  const sent = await paystackFetch('/transfer', secret, {
    source: 'balance',
    amount: toPesewas(transfer.amount),
    currency: 'GHS',
    recipient: recipientCode,
    reference,
    reason: `CryoChain payout ${transfer.settlementId}`,
  });
  if (!sent.ok) return fail(admin, id, sent.raw?.message ?? 'Paystack rejected the transfer.');
  const status = String(sent.raw?.data?.status ?? '').toLowerCase();
  const providerRef = String(sent.raw?.data?.transfer_code ?? reference);
  if (status === 'otp')
    return fail(
      admin,
      id,
      'Paystack is asking for an OTP. Turn off "Confirm transfers before sending" in the Paystack dashboard so payouts can run from the API.',
    );
  if (CONCLUSIVE.has(status) && status !== 'success')
    return fail(admin, id, `Paystack could not complete the transfer (${status}).`);

  await mutateWorkspace(admin, (doc) => {
    const t = transfersOf(doc).find((x) => x.id === id);
    if (!t || t.status === 'succeeded' || t.status === 'manual') return;
    t.attempts += 1;
    t.providerRef = providerRef;
    t.at = Date.now();
    if (status === 'success') markPaid(doc, id, providerRef);
    else t.status = 'sent'; // pending: transfer.success / transfer.failed webhook or a verify call finishes it
  });
  return json({ ok: true, status: status === 'success' ? 'succeeded' : 'sent' });
}

async function fail(admin: Admin, id: string, error: string) {
  await mutateWorkspace(admin, (doc) => markFailed(doc, id, error));
  return json({ ok: false, error }, 502);
}
