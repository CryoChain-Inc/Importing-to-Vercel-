import assert from 'node:assert/strict';

const assertEquals: typeof assert.deepEqual = assert.deepEqual;
import {
  markFailed,
  markPaid,
  markReversedAfterSuccess,
  payoutMaySend,
  recordWalletCheck,
  settleRun,
  type FarmerDoc,
  type TransferDoc,
} from './payouts.ts';

function transfer(partial: Partial<TransferDoc> = {}): TransferDoc {
  return {
    id: 'TR-1',
    runId: 'PR-1',
    settlementId: 'ST-1',
    farmerId: 'F1',
    momo: '0244009999',
    network: 'MTN',
    amount: 45,
    idempotencyKey: 'a1b2c3d4-7001',
    status: 'sent',
    attempts: 1,
    ...partial,
  };
}

function farmer(): FarmerDoc {
  return {
    id: 'F1',
    name: 'Akua Boateng',
    phone: '+233 24 400 9999',
    momo: '0244009999',
    network: 'MTN',
  };
}

function doc(partial: Record<string, unknown> = {}) {
  return {
    seq: 1000,
    transfers: [transfer()],
    farmers: [farmer()],
    settlements: [{ id: 'ST-1', status: 'in_run', deadlineAt: 1_700_000_000_000 }],
    payoutRuns: [
      {
        id: 'PR-1',
        transferIds: ['TR-1'],
        status: 'approved',
        requiresTwo: false,
        approvals: [{ userId: 'OU1' }],
      },
    ],
    ledger: [] as Record<string, unknown>[],
    sms: [] as { ref: string; template: string; body: string }[],
    exceptions: [] as Record<string, unknown>[],
    config: {
      smsTemplates: {
        farmer_paid: 'paid {amount} {masked} {ref}',
        payout_delayed: 'delayed {amount}',
      },
    },
    ...partial,
  };
}

Deno.test('money can move only after the run has the approvals it requires', () => {
  const state = doc();
  assert(payoutMaySend(state, 'PR-1'));
  assertEquals(payoutMaySend(state, 'missing'), false);
  (state.payoutRuns as { status: string }[])[0].status = 'draft';
  assertEquals(payoutMaySend(state, 'PR-1'), false);
  (
    state.payoutRuns as { id: string; status: string; requiresTwo: boolean; approvals: unknown[] }[]
  )[0] = {
    id: 'PR-1',
    status: 'pending_approval',
    requiresTwo: true,
    approvals: [{ userId: 'OU1' }],
  };
  assertEquals(payoutMaySend(state, 'PR-1'), false);
  (state.payoutRuns as { approvals: unknown[] }[])[0].approvals.push({ userId: 'OU2' });
  assert(payoutMaySend(state, 'PR-1'));
});

Deno.test('markPaid is idempotent and writes one ledger row and one SMS', () => {
  const state = doc();
  markPaid(state, 'TR-1', 'PSK-A1B2C3D4');
  markPaid(state, 'TR-1', 'PSK-A1B2C3D4');
  assertEquals((state.transfers as TransferDoc[])[0].status, 'succeeded');
  assertEquals((state.settlements as { status: string }[])[0].status, 'paid');
  assertEquals(state.ledger.length, 1);
  assertEquals(state.ledger[0].kind, 'payout_out');
  assertEquals(state.ledger[0].amount, 45);
  assertEquals(state.sms.length, 1);
  assertEquals(state.sms[0].template, 'farmer_paid');
  assert(state.sms[0].body.includes('PSK-A1B2C3D4'));
  assert(state.sms[0].ref.endsWith('farmer_paid:TR-1'));
  assertEquals((state.payoutRuns as { status: string }[])[0].status, 'completed');
});

Deno.test('three failed attempts open one exception and tell the farmer once', () => {
  const state = doc({
    transfers: [transfer({ status: 'queued', attempts: 0 })],
  });
  markFailed(state, 'TR-1', 'Wallet number not registered');
  markFailed(state, 'TR-1', 'Wallet number not registered');
  assertEquals(state.exceptions.length, 0);
  assertEquals((state.transfers as TransferDoc[])[0].attempts, 2);
  markFailed(state, 'TR-1', 'Wallet number not registered');
  markFailed(state, 'TR-1', 'Wallet number not registered', false);
  assertEquals((state.transfers as TransferDoc[])[0].attempts, 3);
  assertEquals(state.exceptions.length, 1);
  assertEquals(state.exceptions[0].type, 'transfer_failed');
  assertEquals(state.exceptions[0].deadlineAt, 1_700_000_000_000);
  assertEquals(state.sms.length, 1);
  assertEquals(state.sms[0].template, 'payout_delayed');
  assertEquals((state.settlements as { status: string }[])[0].status, 'failed');
  assertEquals((state.payoutRuns as { status: string }[])[0].status, 'partial');
});

Deno.test(
  'a webhook failure does not count a second attempt, and a paid transfer is left alone',
  () => {
    const state = doc({ transfers: [transfer({ status: 'sent', attempts: 1 })] });
    markFailed(state, 'TR-1', 'Paystack reported the transfer failed.', false);
    assertEquals((state.transfers as TransferDoc[])[0].attempts, 1);
    markPaid(state, 'TR-1', 'PSK-OK');
    const ledger = state.ledger.length;
    markFailed(state, 'TR-1', 'late failure');
    assertEquals((state.transfers as TransferDoc[])[0].status, 'succeeded');
    assertEquals(state.ledger.length, ledger);
  },
);

Deno.test('a reversal after success offsets the ledger and reopens the settlement', () => {
  const state = doc();
  markPaid(state, 'TR-1', 'PSK-OK');
  markReversedAfterSuccess(state, 'TR-1', 'PSK-OK');
  markReversedAfterSuccess(state, 'TR-1', 'PSK-OK');
  assertEquals((state.transfers as TransferDoc[])[0].status, 'failed');
  assertEquals((state.settlements as { status: string }[])[0].status, 'failed');
  assertEquals(
    state.ledger.map((row) => row.kind),
    ['correction', 'payout_out'],
  );
  assertEquals(state.ledger[0].direction, 'in');
  assertEquals(state.ledger[0].amount, 45);
  assertEquals(state.exceptions.length, 1);
  assertEquals((state.payoutRuns as { status: string }[])[0].status, 'partial');
});

Deno.test('settleRun leaves a run that is still waiting for approval', () => {
  const state = doc({
    payoutRuns: [{ id: 'PR-1', transferIds: ['TR-1'], status: 'pending_approval' }],
  });
  settleRun(state, 'PR-1');
  assertEquals((state.payoutRuns as { status: string }[])[0].status, 'pending_approval');
  settleRun(state, 'missing');
});

Deno.test('a wallet check records the name or the error', () => {
  const row = farmer();
  recordWalletCheck(row, { ok: true, name: 'AKUA BOATENG' });
  assertEquals(row.momoVerified, true);
  assertEquals(row.momoName, 'AKUA BOATENG');
  assertEquals(row.momoVerifyError, undefined);
  recordWalletCheck(row, { ok: false, error: 'Could not resolve' });
  assertEquals(row.momoVerifyError, 'Could not resolve');
  assertEquals(row.momoVerified, true);
});
