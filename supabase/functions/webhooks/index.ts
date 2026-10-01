import { cors, json, adminClient, mutateWorkspace } from '../_shared/db.ts';
import {
  baseTransferReference,
  fromPesewas,
  paystackFetch,
  toPesewas,
  transferReference,
  validSignature,
} from '../_shared/paystack.ts';
import { markFailed, markPaid, markReversedAfterSuccess, transfersOf } from '../_shared/payouts.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // Paystack signs webhooks with the same secret key used for API calls.
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return json({ error: 'Set PAYSTACK_SECRET_KEY on the webhooks function.' }, 503);

  const rawBody = await req.text();
  const sent = req.headers.get('x-paystack-signature') ?? '';
  if (!(await validSignature(rawBody, sent, secret)))
    return json({ error: 'Webhook signature did not match.' }, 401);

  let event: { event?: string; data?: Record<string, unknown> } = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ ok: true });
  }
  const admin = adminClient();
  const data = event.data ?? {};
  switch (event.event) {
    case 'charge.success':
      await onCharge(admin, data, secret);
      break;
    case 'transfer.success':
      await onTransfer(admin, data, 'success', secret);
      break;
    case 'transfer.failed':
      await onTransfer(admin, data, 'failed', secret);
      break;
    case 'transfer.reversed':
      await onTransfer(admin, data, 'reversed', secret);
      break;
  }
  // 200 for every valid signature. Anything else makes Paystack retry for up to 72 hours.
  return json({ ok: true });
});

/**
 * Farmer payout outcome. A success is re-verified with Paystack (`/transfer/verify/:reference`)
 * and checked against the amount we sent before any money state changes, so a signed-but-replayed
 * or hand-built body can never mark a settlement paid.
 */
async function onTransfer(
  admin: ReturnType<typeof adminClient>,
  data: Record<string, unknown>,
  outcome: 'success' | 'failed' | 'reversed',
  secret: string,
) {
  const reference = String(data.reference ?? '');
  if (!reference) return;
  let providerRef = String(data.transfer_code ?? reference);
  let verifiedAmount: number | undefined;
  if (outcome === 'success') {
    const check = await paystackFetch(`/transfer/verify/${encodeURIComponent(reference)}`, secret);
    const tx = check.raw?.data ?? {};
    if (!check.ok || String(tx.status).toLowerCase() !== 'success') return;
    if (String(tx.currency ?? 'GHS').toUpperCase() !== 'GHS') return;
    providerRef = String(tx.transfer_code ?? providerRef);
    verifiedAmount = Number(tx.amount ?? NaN);
  }
  await mutateWorkspace(admin, (state) => {
    const transfers = transfersOf(state);
    // Exact reference first; older rows without one fall back to the idempotency key.
    const base = baseTransferReference(reference);
    const transfer =
      transfers.find((t) => t.reference === reference) ??
      transfers.find((t) => transferReference(t.idempotencyKey) === base);
    if (!transfer) return;
    if (outcome === 'success') {
      if (verifiedAmount !== undefined && verifiedAmount !== toPesewas(transfer.amount)) {
        markFailed(
          state,
          transfer.id,
          `Paystack confirmed GHS ${fromPesewas(verifiedAmount).toFixed(2)} against GHS ${transfer.amount.toFixed(2)} expected. Check the Paystack dashboard before retrying.`,
          false,
        );
        return;
      }
      markPaid(state, transfer.id, providerRef);
      return;
    }
    if (transfer.status === 'succeeded') {
      if (outcome === 'reversed') markReversedAfterSuccess(state, transfer.id, providerRef);
      return;
    }
    if (transfer.status === 'manual') return;
    // Paystack already made this attempt; do not count it twice.
    markFailed(
      state,
      transfer.id,
      outcome === 'reversed'
        ? 'Paystack reversed the transfer. The wallet could not receive it. Retry later or fix the wallet.'
        : 'Paystack reported the transfer failed. Retry, fix the wallet, or pay manually.',
      false,
    );
  });
}

async function onCharge(
  admin: ReturnType<typeof adminClient>,
  data: Record<string, unknown>,
  secret: string,
) {
  if (String(data.status) !== 'success') return;
  const reference = String(data.reference ?? '');
  if (!reference) return;
  // Ask Paystack again so a signed-but-stale or replayed body cannot mark an order paid on its own.
  const check = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`, secret);
  const tx = check.raw?.data ?? {};
  if (!check.ok || String(tx.status) !== 'success') return;
  if (String(tx.currency ?? 'GHS') !== 'GHS') return;

  const orderId = String(
    (tx.metadata as { order_id?: string } | undefined)?.order_id ?? reference.replace(/-\d+$/, ''),
  );
  const amount = fromPesewas(Number(tx.amount ?? 0));
  const ref = String(tx.reference ?? reference);
  await mutateWorkspace(admin, (state) => {
    const orders = state.orders as {
      id: string;
      status: string;
      total: number;
      paidAt?: number;
      payment?: Record<string, unknown>;
    }[];
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === 'paid' || order.payment?.status === 'confirmed') return;
    const expected = Math.round(order.total * 100) / 100;
    const got = Math.round(amount * 100) / 100;
    const seq = Number(state.seq ?? 1000) + 1;
    state.seq = seq;
    const ledger = state.ledger as Record<string, unknown>[];
    if (got === expected) {
      order.status = 'paid';
      order.paidAt = Date.now();
      order.payment = {
        ...(order.payment ?? {}),
        method: order.payment?.method ?? 'card',
        status: 'confirmed',
        provider: 'paystack',
        ref,
        amount: got,
        at: Date.now(),
      };
      ledger.unshift({
        id: `LG-${seq}`,
        kind: 'payment_in',
        direction: 'in',
        amount: got,
        ref,
        orderId: order.id,
        at: Date.now(),
        by: 'Paystack webhook, verified',
      });
    } else {
      order.status = 'held';
      order.payment = {
        ...(order.payment ?? {}),
        method: order.payment?.method ?? 'card',
        status: 'mismatch',
        provider: 'paystack',
        ref,
        amount: got,
        at: Date.now(),
      };
      ledger.unshift({
        id: `LG-${seq}`,
        kind: 'payment_in',
        direction: 'in',
        amount: got,
        ref,
        orderId: order.id,
        at: Date.now(),
        by: 'Paystack webhook',
        memo: `Mismatch: expected GHS ${expected.toFixed(2)}`,
      });
      const exceptions = state.exceptions as Record<string, unknown>[];
      exceptions.unshift({
        id: `EX-pay-${order.id}`,
        type: 'payment_amount_mismatch',
        severity: 'medium',
        title: `${order.id} · received GHS ${got.toFixed(2)} against GHS ${expected.toFixed(2)}`,
        detail:
          'The order is held. Wait for the balance with the same reference, or refund and cancel.',
        entity: { type: 'order', id: order.id },
        openedAt: Date.now(),
        status: 'open',
      });
    }
  });
}
