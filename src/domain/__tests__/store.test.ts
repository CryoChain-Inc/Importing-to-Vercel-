jest.mock('../../backend/config', () => ({
  supabaseUrl: '',
  supabaseAnonKey: '',
  remoteEnabled: false,
}));

jest.mock('../../backend/remote', () => ({
  commit: jest.fn(),
  dispatchSms: jest.fn(async () => ({ version: 0 })),
  dispatchTransfer: jest.fn(async () => ({ version: 0 })),
  startCheckout: jest.fn(async () => ({ version: 0 })),
  verifyTransfer: jest.fn(async () => ({ version: 0 })),
  payoutPreflight: jest.fn(async () => ({ version: 0 })),
  resolveWallet: jest.fn(async () => ({ version: 0 })),
  stateForNewNode: jest.fn(),
}));

jest.mock('../../backend/media', () => ({
  capturePhoto: jest.fn(async () => null),
  readPosition: jest.fn(async () => null),
  shotDone: (photos: string[], label: string) =>
    photos.some((photo) => photo === label || photo.startsWith(`${label}:`)),
}));

import { buildSeed } from '../seed';
import { buildActions } from '../store';
import type { State } from '../types';
import { creditBalance, round2 } from '../logic';

const NOW = Date.UTC(2026, 9, 7, 8, 0, 0);

function world() {
  let state = structuredClone(buildSeed(NOW)) as State;
  const act = buildActions(
    () => state,
    (fn) => {
      const next = structuredClone(state);
      fn(next);
      state = next;
    },
  );
  return {
    act,
    get state() {
      return state;
    },
  };
}

const shot = { kg: 0, grade: 'A', pickedAt: '2026-10-07', photos: ['crate', 'scale'] };

describe('buyer orders', () => {
  test('a draft adds quantities for the same product and submits with available credit', () => {
    const w = world();
    const balance = creditBalance(w.state, 'O1');
    w.act.draftAdd('tomato', 'A', 10);
    w.act.draftAdd('tomato', 'A', 5);
    w.act.draftAdd('onion', 'A', 20);
    expect(w.state.session.draft.lines).toHaveLength(2);
    expect(w.state.session.draft.lines[0]).toMatchObject({ qtyKg: 15, total: round2(15 * 8.5) });
    const onion = w.state.session.draft.lines[1];
    w.act.draftRemove(onion.id);
    expect(w.state.session.draft.lines).toHaveLength(1);
    w.act.draftRemove(w.state.session.draft.lines[0].id);
    expect(w.act.submitDraft()).toBe('');
    w.act.draftAdd('tomato', 'A', 100);
    const id = w.act.submitDraft();
    expect(id).toBe('CC-2421');
    const order = w.state.orders.find((item) => item.id === id)!;
    expect(order).toMatchObject({
      status: 'submitted',
      orgId: 'O1',
      requestedBy: 'U3',
      linesTotal: 850,
      creditApplied: round2(Math.min(balance, 850)),
    });
    expect(order.total).toBe(round2(order.linesTotal - order.creditApplied));
    expect(w.state.session.draft.lines).toEqual([]);
    expect(w.state.audit[0]).toMatchObject({ action: 'Submitted order', entity: id });
  });

  test('a new order number skips numbers already in use', () => {
    const w = world();
    const sample = w.state.orders[0];
    w.state.orders = [...w.state.orders, { ...sample, id: 'CC-2422' }];
    w.act.draftAdd('tomato', 'A', 10);
    const id = w.act.submitDraft();
    expect(id).toBe('CC-2423');
    expect(w.state.orders.filter((order) => order.id === 'CC-2422')).toHaveLength(1);
    expect(w.state.orders.filter((order) => order.id === id)).toHaveLength(1);
  });

  test('an invalid delivery day is replaced with the lead time', () => {
    const w = world();
    w.act.draftSet({ deliveryDate: 'tomorrow', address: 'Dock 2' });
    w.act.draftAdd('tomato', 'A', 50);
    const id = w.act.submitDraft();
    const order = w.state.orders.find((item) => item.id === id)!;
    expect(order.deliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(order.address).toBe('Dock 2');
  });

  test('only an approver inside their limit can approve', () => {
    const w = world();
    w.act.draftAdd('tomato', 'A', 1500);
    const id = w.act.submitDraft();
    const total = w.state.orders.find((item) => item.id === id)!.total;
    expect(total).toBeGreaterThan(10000);
    expect(total).toBeLessThanOrEqual(25000);

    expect(w.act.approveOrder(id)).toEqual({ ok: false, why: 'Only an approver can approve.' });
    w.act.setBuyerUser('U2');
    expect(w.act.approveOrder(id).ok).toBe(false);
    expect(w.act.approveOrder(id).why).toContain('Over your limit');
    w.act.setBuyerUser('U1');
    expect(w.act.approveOrder(id)).toEqual({ ok: true, why: undefined });
    expect(w.state.orders.find((item) => item.id === id)).toMatchObject({
      status: 'approved',
      approvedBy: 'U1',
    });
  });

  test('bank payments wait for a matching amount and card payments record a receipt', () => {
    const w = world();
    w.act.setBuyerUser('U1');
    w.act.draftAdd('cabbage', 'A', 50);
    const bankId = w.act.submitDraft();
    w.act.approveOrder(bankId);
    w.act.payOrder(bankId, 'bank_transfer');
    const awaiting = w.state.orders.find((item) => item.id === bankId)!;
    expect(awaiting.status).toBe('awaiting_payment');
    w.act.confirmBankPayment(bankId, awaiting.total - 1);
    expect(w.state.orders.find((item) => item.id === bankId)!.status).toBe('held');
    expect(w.state.exceptions[0]).toMatchObject({
      type: 'payment_amount_mismatch',
      entity: { type: 'order', id: bankId },
    });

    w.act.draftAdd('cabbage', 'A', 50);
    const cardId = w.act.submitDraft();
    w.act.approveOrder(cardId);
    w.act.payOrder(cardId, 'card');
    const paid = w.state.orders.find((item) => item.id === cardId)!;
    expect(paid.status).toBe('paid');
    expect(paid.payment?.status).toBe('confirmed');
    expect(w.state.ledger[0]).toMatchObject({
      kind: 'payment_in',
      orderId: cardId,
      amount: paid.total,
    });
  });

  test('an exact bank amount marks the order paid', () => {
    const w = world();
    w.act.setBuyerUser('U1');
    w.act.draftAdd('cabbage', 'A', 40);
    const id = w.act.submitDraft();
    w.act.approveOrder(id);
    w.act.payOrder(id, 'bank_transfer');
    const total = w.state.orders.find((item) => item.id === id)!.total;
    w.act.confirmBankPayment(id, total);
    expect(w.state.orders.find((item) => item.id === id)).toMatchObject({
      status: 'paid',
      payment: { status: 'confirmed', amount: total },
    });
  });

  test('sending an order back cancels it and restores the draft', () => {
    const w = world();
    const before = w.state.orders.find((item) => item.id === 'CC-2419')!.lines.length;
    w.act.sendBack('CC-2419');
    expect(w.state.orders.find((item) => item.id === 'CC-2419')!.status).toBe('cancelled');
    expect(w.state.session.draft.lines).toHaveLength(before);
  });

  test('a buyer rejection issues credit and does not change the farmer settlement', () => {
    const w = world();
    w.act.capture('CS-3032', { ...shot, kg: 350 });
    w.act.coldBox('CS-3032');
    const settlement = w.state.settlements.find((item) => item.consignmentId === 'CS-3032')!;
    expect(settlement).toMatchObject({ net: round2(350 * 4.5), status: 'pending_delivery' });
    const locked = settlement.net;
    w.act.rejectLine('CC-2410', 'CC-2410-1', 12, 'bruised');
    const line = w.state.orders.find((item) => item.id === 'CC-2410')!.lines[0];
    expect(line.credit).toBe(round2(12 * line.unitPrice));
    expect(w.state.ledger[0]).toMatchObject({ kind: 'credit_note', orderId: 'CC-2410' });
    expect(w.state.settlements.find((item) => item.consignmentId === 'CS-3032')!.net).toBe(locked);
    expect(w.state.exceptions[0].type).toBe('delivery_rejection');
  });

  test('ops can issue a credit note once for a rejected line', () => {
    const w = world();
    const order = w.state.orders.find((item) => item.id === 'CC-2410')!;
    order.lines[0].rejectedKg = 8;
    const price = order.lines[0].unitPrice;
    const before = w.state.ledger.filter((item) => item.kind === 'credit_note').length;
    w.act.issueCredit('CC-2410', 'CC-2410-1');
    w.act.issueCredit('CC-2410', 'CC-2410-1');
    expect(w.state.ledger.filter((item) => item.kind === 'credit_note')).toHaveLength(before + 1);
    expect(w.state.orders.find((item) => item.id === 'CC-2410')!.lines[0].credit).toBe(
      round2(8 * price),
    );
  });
});

describe('allocation and field capture', () => {
  test('a paid order can be allocated and a delivered order cannot', () => {
    const w = world();
    const before = w.state.consignments.length;
    w.act.allocate('CC-2402', 'CC-2402-1', [{ farmerId: 'F1', kg: 10, price: 4 }]);
    expect(w.state.consignments).toHaveLength(before);

    w.act.allocate('CC-2420', 'CC-2420-1', [
      { farmerId: 'F1', kg: 100, price: 4 },
      { farmerId: 'F2', kg: 0, price: 4 },
    ]);
    expect(w.state.orders.find((item) => item.id === 'CC-2420')!.status).toBe('allocated');
    expect(w.state.consignments).toHaveLength(before + 1);
    expect(w.state.sms[0]).toMatchObject({ template: 'allocation_confirmed', farmerId: 'F1' });
  });

  test('a short capture opens an exception and a re-cut resolves it', () => {
    const w = world();
    w.act.capture('CS-3031', { ...shot, kg: 300 });
    const row = w.state.consignments.find((item) => item.id === 'CS-3031')!;
    expect(row.short).toBe(true);
    expect(w.state.exceptions[0]).toMatchObject({
      type: 'consignment_short',
      payload: { orderId: 'CC-2410', shortfall: 100 },
    });
    w.act.allocate('CC-2410', 'CC-2410-1', [{ farmerId: 'F8', kg: 100, price: 4.5 }]);
    expect(w.state.exceptions.find((item) => item.type === 'consignment_short')!.status).toBe(
      'resolved',
    );
  });

  test('cold box locks a settlement; a decline does not', () => {
    const w = world();
    w.act.capture('CS-3032', { ...shot, kg: 340 });
    w.act.coldBox('CS-3032');
    expect(w.state.settlements.find((item) => item.consignmentId === 'CS-3032')).toMatchObject({
      payableKg: 340,
      net: round2(340 * 4.5),
      status: 'pending_delivery',
    });
    expect(w.state.sms[0].template).toBe('consignment_captured');

    w.act.declineSale('CS-3033', 'not harvested');
    expect(w.state.consignments.find((item) => item.id === 'CS-3033')!.status).toBe('declined');
    expect(w.state.exceptions[0]).toMatchObject({ type: 'farmer_no_show' });
    expect(w.state.settlements.some((item) => item.consignmentId === 'CS-3033')).toBe(false);
  });

  test('offline events stay in the outbox until sync, and a replay does not text the farmer twice', () => {
    const w = world();
    w.act.setOnline('DEV-A1', false);
    const farmerId = w.act.registerFarmer({
      name: 'Ama Test',
      momo: '0244000001',
      network: 'MTN',
      tier: 'minimum',
      village: 'Adeiso',
    });
    const device = () => w.state.devices.find((item) => item.id === 'DEV-A1')!;
    expect(device().outbox).toHaveLength(1);
    expect(w.state.farmers.find((item) => item.id === farmerId)!.pendingSync).toBe(true);
    device().outbox.push(structuredClone(device().outbox[0]));
    w.act.setOnline('DEV-A1', true);
    w.act.sync('DEV-A1');
    expect(device().outbox).toEqual([]);
    expect(w.state.farmers.find((item) => item.id === farmerId)!.pendingSync).toBe(false);
    expect(
      w.state.sms.filter(
        (item) => item.farmerId === farmerId && item.template === 'farmer_registered',
      ),
    ).toHaveLength(1);
  });

  test('a cold box captured while offline waits for sync, and a cancelled row is held', () => {
    const w = world();
    w.act.setOnline('DEV-A1', false);
    w.act.capture('CS-3034', { ...shot, kg: 300 });
    w.act.coldBox('CS-3034');
    expect(w.state.settlements.some((item) => item.consignmentId === 'CS-3034')).toBe(false);
    w.state.consignments.find((item) => item.id === 'CS-3034')!.status = 'cancelled';
    w.act.setOnline('DEV-A1', true);
    w.act.sync('DEV-A1');
    const settlement = w.state.settlements.find((item) => item.consignmentId === 'CS-3034')!;
    expect(settlement.status).toBe('held');
    expect(settlement.heldReason).toContain('Sync conflict');
    const exception = w.state.exceptions.find(
      (item) => item.type === 'sync_conflict_pay_affecting',
    )!;
    expect(exception.status).toBe('open');
    w.act.resolveException(exception.id, 'Keep the capture');
    expect(w.state.settlements.find((item) => item.consignmentId === 'CS-3034')!.status).toBe(
      'pending_delivery',
    );
  });

  test('an ad hoc consignment stays held until ops confirms it', () => {
    const w = world();
    const id = w.act.adHoc('F8', 'CC-2410', 'CC-2410-1', 20);
    w.act.capture(id, { ...shot, kg: 20 });
    w.act.coldBox(id);
    expect(w.state.settlements.find((item) => item.consignmentId === id)!.status).toBe('held');
    w.act.confirmAdHoc(id);
    expect(w.state.settlements.find((item) => item.consignmentId === id)).toMatchObject({
      status: 'pending_delivery',
      heldReason: undefined,
    });
    expect(
      w.state.exceptions.find(
        (item) => item.entity?.id === id && item.type === 'ad_hoc_consignment',
      )!.status,
    ).toBe('resolved');
  });
});

describe('driver run', () => {
  test('collection waits for the cold box, and a fully declined stop can be left', () => {
    const w = world();
    const stop = () =>
      w.state.runs.find((item) => item.id === 'RUN-1008')!.stops.find((item) => item.seq === 3)!;
    w.act.stamp('RUN-1008', 3, 'collected');
    expect(stop().collectedAt).toBeUndefined();
    w.act.capture('CS-3031', { ...shot, kg: 400 });
    w.act.coldBox('CS-3031');
    w.act.stamp('RUN-1008', 3, 'arrived');
    w.act.stamp('RUN-1008', 3, 'collected');
    w.act.stamp('RUN-1008', 3, 'departed');
    expect(stop().collectedAt).toEqual(expect.any(Number));
    expect(stop().departedAt).toEqual(expect.any(Number));
    expect(w.state.consignments.find((item) => item.id === 'CS-3031')!.status).toBe('in_transit');

    const declined = () =>
      w.state.runs.find((item) => item.id === 'RUN-1008')!.stops.find((item) => item.seq === 5)!;
    w.act.declineSale('CS-3033', 'crop sold elsewhere');
    w.act.stamp('RUN-1008', 5, 'arrived');
    w.act.stamp('RUN-1008', 5, 'departed');
    expect(declined().departedAt).toEqual(expect.any(Number));
    expect(declined().collectedAt).toBeUndefined();
  });

  test('a temperature outside the run range opens a high exception', () => {
    const w = world();
    const before = w.state.exceptions.filter(
      (item) => item.type === 'temperature_out_of_range',
    ).length;
    w.act.recordTemp('RUN-1008', 'load', 4);
    expect(
      w.state.exceptions.filter((item) => item.type === 'temperature_out_of_range'),
    ).toHaveLength(before);
    w.act.recordTemp('RUN-1008', 'load', 9, undefined, 'door left open');
    const opened = w.state.exceptions.find((item) => item.type === 'temperature_out_of_range')!;
    expect(opened.severity).toBe('high');
    expect(opened.detail).toContain('9');
    expect(w.state.temps.at(-1)?.outOfRange).toBe(true);
  });

  test('a run cannot be completed while a checkpoint or the delivery is missing', () => {
    const w = world();
    const missing = w.act.completeRun('RUN-1008');
    expect(missing.length).toBeGreaterThan(0);
    expect(w.state.runs.find((item) => item.id === 'RUN-1008')!.status).not.toBe('closed');
  });
});

describe('payouts', () => {
  test('a run over the threshold needs a second person, and the creator cannot approve twice', () => {
    const w = world();
    const id = w.act.createPayoutRun(['ST-5011', 'ST-5012', 'ST-5013']);
    const payout = w.state.payoutRuns.find((item) => item.id === id)!;
    expect(payout.total).toBeGreaterThan(w.state.config.payoutThreshold);
    expect(payout).toMatchObject({ requiresTwo: true, status: 'pending_approval' });
    expect(payout.approvals.map((item) => item.userId)).toEqual(['OU1']);
    expect(w.state.settlements.find((item) => item.id === 'ST-5011')!.status).toBe('in_run');

    w.act.executePayoutRun(id);
    expect(w.state.transfers.find((item) => item.settlementId === 'ST-5011')!.status).toBe(
      'queued',
    );

    expect(w.act.approvePayoutRun(id).ok).toBe(false);
    w.act.setOpsUser('OU2');
    expect(w.act.approvePayoutRun(id)).toEqual({ ok: true, why: '' });
    expect(w.state.payoutRuns.find((item) => item.id === id)!.status).toBe('approved');
  });

  test('a correction forces a second approval even under the threshold', () => {
    const w = world();
    const settlement = w.state.settlements.find((item) => item.id === 'ST-5013')!;
    settlement.correctionOf = 'ST-OLD';
    const id = w.act.createPayoutRun(['ST-5013']);
    expect(w.state.payoutRuns.find((item) => item.id === id)).toMatchObject({
      requiresTwo: true,
      status: 'pending_approval',
      total: settlement.net,
    });
    expect(settlement.net).toBeLessThan(w.state.config.payoutThreshold);
  });

  test('a wallet over the tier limit is held, and a bad wallet fails three times', () => {
    const w = world();
    w.act.capture('CS-3031', { ...shot, kg: 700 });
    w.act.coldBox('CS-3031');
    w.act.closeRun('RUN-1008', 'Ended early');
    const settlement = w.state.settlements.find((item) => item.consignmentId === 'CS-3031')!;
    expect(settlement.status).toBe('payable');
    expect(settlement.net).toBe(round2(700 * 4.5));
    const id = w.act.createPayoutRun([settlement.id]);
    const transfer = w.state.transfers.find((item) => item.runId === id)!;
    expect(transfer.status).toBe('held');
    expect(w.state.exceptions[0]).toMatchObject({
      type: 'wallet_limit',
      entity: { id: transfer.id },
    });

    const bad = world();
    bad.act.capture('CS-3036', { ...shot, kg: 20 });
    bad.act.coldBox('CS-3036');
    bad.act.closeRun('RUN-1008', 'Ended early');
    const badSettlement = bad.state.settlements.find((item) => item.consignmentId === 'CS-3036')!;
    const badRun = bad.act.createPayoutRun([badSettlement.id]);
    bad.act.executePayoutRun(badRun);
    bad.act.executePayoutRun(badRun);
    bad.act.executePayoutRun(badRun);
    const failed = bad.state.transfers.find((item) => item.runId === badRun)!;
    expect(failed).toMatchObject({ status: 'failed', attempts: 3 });
    expect(bad.state.exceptions[0].type).toBe('transfer_failed');
    expect(bad.state.sms.some((item) => item.template === 'payout_delayed')).toBe(true);
    expect(bad.state.payoutRuns.find((item) => item.id === badRun)!.status).toBe('partial');
  });

  test('a successful payout is paid once, and a later retry does not add another ledger row', () => {
    const w = world();
    w.act.capture('CS-3032', { ...shot, kg: 100 });
    w.act.coldBox('CS-3032');
    w.act.closeRun('RUN-1008', 'Ended early');
    const settlement = w.state.settlements.find((item) => item.consignmentId === 'CS-3032')!;
    const id = w.act.createPayoutRun([settlement.id]);
    expect(w.state.payoutRuns.find((item) => item.id === id)!.status).toBe('approved');
    w.act.executePayoutRun(id);
    const transfer = w.state.transfers.find((item) => item.runId === id)!;
    expect(transfer.status).toBe('succeeded');
    expect(transfer.providerRef).toMatch(/^PSK-/);
    expect(w.state.settlements.find((item) => item.id === settlement.id)!.status).toBe('paid');
    expect(w.state.payoutRuns.find((item) => item.id === id)!.status).toBe('completed');
    const payouts = () =>
      w.state.ledger.filter(
        (item) => item.transferId === transfer.id && item.kind === 'payout_out',
      );
    expect(payouts()).toHaveLength(1);
    w.act.retryTransfer(transfer.id);
    expect(payouts()).toHaveLength(1);
    expect(
      w.state.sms.filter(
        (item) => item.template === 'farmer_paid' && item.ref.includes(transfer.id),
      ),
    ).toHaveLength(1);
  });

  test('rejecting a run returns the money to payable, and a manual payment clears the exception', () => {
    const w = world();
    w.act.capture('CS-3036', { ...shot, kg: 20 });
    w.act.coldBox('CS-3036');
    w.act.closeRun('RUN-1008', 'Ended early');
    const settlement = w.state.settlements.find((item) => item.consignmentId === 'CS-3036')!;
    const id = w.act.createPayoutRun([settlement.id]);
    w.act.executePayoutRun(id);
    const transfer = w.state.transfers.find((item) => item.runId === id)!;
    expect(transfer.status).toBe('failed');
    w.act.markManual(transfer.id, 'HAND-1');
    expect(w.state.transfers.find((item) => item.id === transfer.id)!.status).toBe('manual');
    expect(w.state.settlements.find((item) => item.id === settlement.id)!.status).toBe('paid');
    expect(w.state.ledger[0]).toMatchObject({ kind: 'manual_transfer', ref: 'HAND-1' });
    expect(w.state.exceptions.find((item) => item.entity?.id === transfer.id)?.status).not.toBe(
      'open',
    );

    const rejected = world();
    rejected.act.capture('CS-3032', { ...shot, kg: 50 });
    rejected.act.coldBox('CS-3032');
    rejected.act.closeRun('RUN-1008', 'Ended early');
    const row = rejected.state.settlements.find((item) => item.consignmentId === 'CS-3032')!;
    const runId = rejected.act.createPayoutRun([row.id]);
    rejected.act.rejectPayoutRun(runId, 'Wrong farmers');
    expect(rejected.state.payoutRuns.find((item) => item.id === runId)!.status).toBe('cancelled');
    expect(rejected.state.settlements.find((item) => item.id === row.id)!.status).toBe('payable');
    expect(rejected.state.transfers.find((item) => item.runId === runId)).toMatchObject({
      status: 'failed',
      lastError: 'Run rejected',
    });
  });

  test('changing a wallet clears the old verification and updates failed transfers', () => {
    const w = world();
    const farmer = w.state.farmers.find((item) => item.id === 'F6')!;
    expect(farmer.walletBad).toBe(true);
    w.act.fixWallet('F6', '0244111222', 'MTN');
    expect(w.state.farmers.find((item) => item.id === 'F6')).toMatchObject({
      momo: '0244111222',
      network: 'MTN',
      walletBad: false,
      momoVerified: false,
    });
    expect(w.state.sms[0]).toMatchObject({ template: 'wallet_changed', farmerId: 'F6' });
  });
});

describe('ops housekeeping', () => {
  test('registering an organisation creates its admin and approving it records an account', () => {
    const w = world();
    const orgId = w.act.registerOrg({
      name: 'New Kitchen',
      type: 'Hotel',
      country: 'Ghana',
      address: 'Accra',
      contact: 'Ama Mensah, Buyer',
      phone: '+233 24 000 0000',
    });
    const org = w.state.orgs.find((item) => item.id === orgId)!;
    expect(org.status).toBe('pending');
    const user = w.state.buyerUsers.find((item) => item.id === w.state.session.buyerUserId)!;
    expect(user).toMatchObject({ orgId, roles: ['admin', 'approver'], name: 'Ama Mensah' });
    w.act.approveOrg(orgId);
    expect(w.state.orgs.find((item) => item.id === orgId)!.status).toBe('approved');
    expect(w.state.orgs.find((item) => item.id === orgId)!.virtualAccount?.bank).toBe(
      'Stanbic Bank Ghana',
    );
    w.act.setVirtualAccount(orgId, '  CalBank  ', ' 123 ');
    expect(w.state.orgs.find((item) => item.id === orgId)!.virtualAccount).toEqual({
      bank: 'CalBank',
      number: '123',
    });
  });

  test('config changes and exception assignment are audited', () => {
    const w = world();
    w.act.updateConfig({ payoutThreshold: 5000 }, 'OU2, OU3');
    expect(w.state.config.payoutThreshold).toBe(5000);
    expect(w.state.audit[0].action).toBe('Changed config');
    const exception = w.state.exceptions[0];
    w.act.assignException(exception.id);
    expect(w.state.exceptions.find((item) => item.id === exception.id)).toMatchObject({
      status: 'in_progress',
      assignee: 'Ama Owusu',
    });
  });

  test('a run can be created only with a real driver and agent', () => {
    const w = world();
    expect(
      w.act.createRun({
        date: '2026-10-08',
        truck: 'GS 1-26',
        driverId: 'missing',
        agentId: 'DEV-A1',
        consignmentIds: ['CS-3031'],
        deliveryLabel: 'Kitchen',
        deliveryAddress: 'Accra',
      }),
    ).toBe('');
    const id = w.act.createRun({
      date: '2026-10-08',
      truck: 'GS 1-26',
      driverId: 'DEV-D1',
      agentId: 'DEV-A1',
      consignmentIds: ['CS-3031', 'CS-3032'],
      deliveryLabel: 'Kitchen',
      deliveryAddress: 'Accra',
    });
    const created = w.state.runs.find((item) => item.id === id)!;
    expect(created.stops.filter((item) => item.kind === 'farm')).toHaveLength(2);
    expect(created.stops.at(-1)?.kind).toBe('delivery');
    expect(w.state.orders.find((item) => item.id === 'CC-2410')!.runId).toBe(id);
  });
});
