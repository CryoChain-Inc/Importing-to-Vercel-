import { cors, json, adminClient, mutateWorkspace } from '../_shared/db.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const secretHash = Deno.env.get('FLW_WEBHOOK_SECRET');
  if (!secretHash)
    return json(
      { error: 'Set FLW_WEBHOOK_SECRET to the verif-hash from the Flutterwave dashboard.' },
      503,
    );
  const sent = req.headers.get('verif-hash') ?? '';
  if (sent !== secretHash) return json({ error: 'Webhook signature did not match.' }, 401);
  const event = await req.json().catch(() => ({}));
  const admin = adminClient();
  const name = String(event?.event ?? '');
  if (name === 'charge.completed') await onCharge(admin, event?.data ?? {});
  if (name === 'transfer.completed') await onTransfer(admin, event?.data ?? {});
  return json({ ok: true });
});

async function onCharge(admin: ReturnType<typeof adminClient>, data: Record<string, unknown>) {
  if (String(data.status) !== 'successful') return;
  const id = String(data.id ?? '');
  const verified = await fetch(`https://api.flutterwave.com/v3/transactions/${id}/verify`, {
    headers: { Authorization: `Bearer ${Deno.env.get('FLW_SECRET_KEY')}` },
  });
  const raw = await verified.json().catch(() => ({}));
  const tx = raw?.data ?? {};
  if (String(tx.status) !== 'successful') return;
  const orderId = String(
    (tx.meta as { order_id?: string } | undefined)?.order_id ??
      String(tx.tx_ref ?? '').split('-')[0],
  );
  const amount = Number(tx.amount ?? 0);
  const ref = String(tx.flw_ref ?? tx.tx_ref ?? id);
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
        by: 'Flutterwave webhook, verified',
      });
    } else {
      order.status = 'held';
      order.payment = {
        ...(order.payment ?? {}),
        method: order.payment?.method ?? 'bank_transfer',
        status: 'mismatch',
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
        by: 'Flutterwave webhook',
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

async function onTransfer(admin: ReturnType<typeof adminClient>, data: Record<string, unknown>) {
  const reference = String(data.reference ?? '');
  const status = String(data.status ?? '').toUpperCase();
  const verifiedId = String(data.id ?? '');
  if (verifiedId && Deno.env.get('FLW_SECRET_KEY')) {
    await fetch(`https://api.flutterwave.com/v3/transfers/${verifiedId}`, {
      headers: { Authorization: `Bearer ${Deno.env.get('FLW_SECRET_KEY')}` },
    });
  }
  await mutateWorkspace(admin, (state) => {
    const transfers = state.transfers as {
      id: string;
      idempotencyKey: string;
      status: string;
      providerRef?: string;
      at?: number;
      settlementId: string;
      amount: number;
      runId: string;
      lastError?: string;
      attempts: number;
    }[];
    const transfer = transfers.find((t) => t.idempotencyKey === reference || t.id === reference);
    if (!transfer || transfer.status === 'succeeded' || transfer.status === 'manual') return;
    if (status === 'SUCCESSFUL') {
      transfer.status = 'succeeded';
      transfer.providerRef = String(data.id ?? reference);
      transfer.at = Date.now();
      const settlements = state.settlements as { id: string; status: string }[];
      const settlement = settlements.find((s) => s.id === transfer.settlementId);
      if (settlement) settlement.status = 'paid';
      const ledger = state.ledger as Record<string, unknown>[];
      if (!ledger.some((l) => l.transferId === transfer.id)) {
        const seq = Number(state.seq ?? 1000) + 1;
        state.seq = seq;
        ledger.unshift({
          id: `LG-${seq}`,
          kind: 'payout_out',
          direction: 'out',
          amount: transfer.amount,
          ref: transfer.providerRef,
          settlementId: transfer.settlementId,
          transferId: transfer.id,
          at: Date.now(),
          by: `Payout run ${transfer.runId}`,
        });
      }
    } else if (status === 'FAILED') {
      transfer.status = 'failed';
      transfer.lastError = String(data.complete_message ?? 'Transfer failed at the provider.');
      const settlements = state.settlements as { id: string; status: string }[];
      const settlement = settlements.find((s) => s.id === transfer.settlementId);
      if (settlement && settlement.status !== 'paid') settlement.status = 'failed';
    }
    const runs = state.payoutRuns as {
      id: string;
      transferIds: string[];
      status: string;
      executedAt?: number;
    }[];
    const run = runs.find((r) => r.id === transfer.runId);
    if (run) {
      const mine = transfers.filter((t) => run.transferIds.includes(t.id));
      if (mine.every((t) => t.status === 'succeeded' || t.status === 'manual'))
        run.status = 'completed';
      else if (mine.some((t) => t.status === 'queued' || t.status === 'sent'))
        run.status = 'executing';
      else run.status = 'partial';
    }
  });
}
