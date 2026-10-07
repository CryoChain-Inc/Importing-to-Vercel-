import type {
  Config,
  Consignment,
  Device,
  Farmer,
  OrderStatus,
  PayoutRun,
  SettlementStatus,
  State,
  Transfer,
} from '../types';
import {
  H,
  ORDER_LABEL,
  ORDER_STEPS,
  ORDER_TONE,
  CONS_LABEL,
  CONS_TONE,
  PR_LABEL,
  PR_TONE,
  SETT_LABEL,
  SETT_TONE,
  TR_LABEL,
  TR_TONE,
  addDays,
  allocationClosed,
  approvalsNeeded,
  approvalStillOpen,
  assignedStaffName,
  canApprove,
  checkpointLabel,
  computeSettlement,
  countdown,
  creditBalance,
  expiresIn,
  fmtDay,
  fmtDayLong,
  fmtStamp,
  fmtTime,
  ghs,
  isIsoDay,
  isShort,
  isoDay,
  kg,
  lineCoverage,
  maskMomo,
  nextId,
  num2,
  orderById,
  orderLinesTotal,
  orderStepIndex,
  payoutReady,
  payoutRequiresTwo,
  round2,
  runAssignedTo,
  settlementDeadline,
  simulateTransfer,
  stopCollection,
  uuid,
  walletLimitFor,
} from '../logic';

const NOW = Date.UTC(2026, 9, 7, 9, 5, 0);

function consignment(
  partial: Partial<Consignment> & Pick<Consignment, 'id' | 'status' | 'plannedKg'>,
): Consignment {
  return {
    orderId: 'CC-1',
    lineId: 'LN-1',
    farmerId: 'F1',
    productId: 'tomato',
    productName: 'Tomato',
    pricePerKg: 4.5,
    photos: [],
    version: 1,
    ...partial,
  };
}

function run(partial: Partial<PayoutRun> = {}): PayoutRun {
  return {
    id: 'PR-1',
    createdBy: 'OU1',
    createdByName: 'Ama Owusu',
    createdAt: NOW,
    total: 100,
    count: 1,
    threshold: 2000,
    requiresTwo: false,
    approvals: [],
    status: 'pending_approval',
    transferIds: ['TR-1'],
    ...partial,
  };
}

function farmer(partial: Partial<Farmer> = {}): Farmer {
  return {
    id: 'F1',
    code: 'FM-0101',
    name: 'Akua Boateng',
    momo: '0244009999',
    network: 'MTN',
    tier: 'minimum',
    kyc: 'unverified',
    village: 'Adeiso',
    consentAt: NOW,
    registeredBy: 'Kojo Antwi',
    ...partial,
  };
}

const limits = {
  walletLimits: { minimum: 3000, medium: 15000, enhanced: 25000 },
} as Config;

describe('money and quantities', () => {
  test('round2 uses decimal rounding instead of binary float residue', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(10.5 * 4.5)).toBe(47.25);
    expect(round2(Number.NaN)).toBe(0);
  });

  test('formats cedis, numbers, kilograms, and masked wallets', () => {
    expect(ghs(1234.5)).toBe('GHS 1,234.50');
    expect(ghs(-5)).toBe('GHS 5.00');
    expect(ghs(-5, true)).toBe('− GHS 5.00');
    expect(num2(8)).toBe('8.00');
    expect(kg(12.34)).toBe('12.3 kg');
    expect(kg(10)).toBe('10 kg');
    expect(maskMomo('0244009999')).toBe('••• ••• •999');
  });

  test('settlement is locked to the weighed kilograms', () => {
    expect(computeSettlement(10, 4.5)).toEqual({ gross: 45, deductions: 0, net: 45 });
    expect(computeSettlement(10.5, 4.5, 2)).toEqual({ gross: 47.25, deductions: 2, net: 45.25 });
    expect(() => computeSettlement(0, 4.5)).toThrow('Weight must be above zero');
    expect(() => computeSettlement(-1, 4.5)).toThrow('Weight must be above zero');
  });

  test('line coverage ignores cancelled and declined consignments', () => {
    const line = { qtyKg: 100 };
    const rows = [
      consignment({ id: 'a', status: 'planned', plannedKg: 40 }),
      consignment({ id: 'b', status: 'captured', plannedKg: 50, farmGateKg: 30 }),
      consignment({ id: 'c', status: 'cancelled', plannedKg: 80 }),
      consignment({ id: 'd', status: 'declined', plannedKg: 80 }),
    ];
    expect(lineCoverage(line, rows)).toEqual({ covered: 70, shortfall: 30 });
  });

  test('a consignment is short only after a weight is captured below tolerance', () => {
    const planned = consignment({ id: 'a', status: 'planned', plannedKg: 100 });
    expect(isShort(planned, 5)).toBe(false);
    expect(isShort({ ...planned, farmGateKg: 95 }, 5)).toBe(false);
    expect(isShort({ ...planned, farmGateKg: 94.9 }, 5)).toBe(true);
  });

  test('order line totals and credit balance', () => {
    expect(orderLinesTotal([{ total: 10.1 }, { total: 0.2 }])).toBe(10.3);
    const state = {
      orders: [
        { id: 'O1', orgId: 'org', status: 'submitted', creditApplied: 40 },
        { id: 'O2', orgId: 'org', status: 'cancelled', creditApplied: 99 },
        { id: 'O3', orgId: 'other', status: 'submitted', creditApplied: 15 },
        { id: 'O4', orgId: 'org', status: 'draft', creditApplied: 7 },
      ],
      ledger: [
        { kind: 'credit_note', orderId: 'O1', amount: 100 },
        { kind: 'credit_note', orderId: 'O3', amount: 50 },
        { kind: 'payment_in', orderId: 'O1', amount: 100 },
      ],
    } as unknown as State;
    expect(creditBalance(state, 'org')).toBe(60);
    expect(orderById(state, 'O3')?.orgId).toBe('other');
    expect(orderById(state, 'missing')).toBeUndefined();
  });
});

describe('dates and countdowns', () => {
  test('formats stamps in the local calendar day', () => {
    const day = new Date(NOW);
    const hh = String(day.getHours()).padStart(2, '0');
    const mm = String(day.getMinutes()).padStart(2, '0');
    const y = day.getFullYear();
    const month = String(day.getMonth() + 1).padStart(2, '0');
    const date = String(day.getDate()).padStart(2, '0');
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    expect(fmtTime(NOW)).toBe(`${hh}:${mm}`);
    expect(fmtStamp(NOW)).toBe(`${hh}:${mm} · ${day.getDate()} ${months[day.getMonth()]}`);
    expect(isoDay(NOW)).toBe(`${y}-${month}-${date}`);
    expect(fmtDay('2026-10-07')).toBe('Wed 7 Oct');
    expect(fmtDay('2026-10-07T15:00:00')).toBe('Wed 7 Oct');
    expect(fmtDayLong('2026-10-07')).toBe('Wednesday 7 Oct');
    expect(fmtDay('not-a-day')).toBe('—');
    expect(isIsoDay('2026-10-07')).toBe(true);
    expect(isIsoDay('2026-10-07T00:00:00')).toBe(true);
    expect(isIsoDay('07-10-2026')).toBe(false);
  });

  test('adds calendar days across a month boundary', () => {
    expect(addDays('2026-10-07', 2)).toBe('2026-10-09');
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  test('countdown tone follows the four hour warning line', () => {
    expect(countdown(NOW + 5 * H + 7 * 60_000, NOW)).toEqual({
      text: '5 h 07 m left',
      tone: 'ok',
    });
    expect(countdown(NOW + 4 * H, NOW).tone).toBe('ok');
    expect(countdown(NOW + 3 * H + 59 * 60_000, NOW).tone).toBe('warn');
    expect(countdown(NOW - H - 60_000, NOW)).toEqual({
      text: 'Overdue 1 h 01 m',
      tone: 'alert',
    });
    expect(expiresIn(NOW - 5_000, NOW)).toBe('0 h 00 m');
    expect(expiresIn(NOW + 2 * H + 3 * 60_000, NOW)).toBe('2 h 03 m');
  });

  test('a farmer must be paid within 24 hours of the payable time', () => {
    expect(settlementDeadline(NOW)).toBe(NOW + 24 * H);
  });
});

describe('status maps', () => {
  const orders: OrderStatus[] = [
    'draft',
    'submitted',
    'approved',
    'awaiting_payment',
    'paid',
    'allocated',
    'in_collection',
    'delivered',
    'closed',
    'expired',
    'cancelled',
    'held',
  ];
  const consignments: Consignment['status'][] = [
    'planned',
    'captured',
    'cold_boxed',
    'declined',
    'in_transit',
    'delivered',
    'cancelled',
  ];
  const settlements: SettlementStatus[] = [
    'pending_delivery',
    'payable',
    'held',
    'in_run',
    'paid',
    'failed',
    'corrected',
  ];

  test('every order, consignment, settlement, transfer, and payout status has a label and tone', () => {
    for (const status of orders) {
      expect(ORDER_LABEL[status].length).toBeGreaterThan(0);
      expect(ORDER_TONE[status]).toBeTruthy();
    }
    for (const status of consignments) {
      expect(CONS_LABEL[status].length).toBeGreaterThan(0);
      expect(CONS_TONE[status]).toBeTruthy();
    }
    for (const status of settlements) {
      expect(SETT_LABEL[status].length).toBeGreaterThan(0);
      expect(SETT_TONE[status]).toBeTruthy();
    }
    for (const status of ['queued', 'sent', 'succeeded', 'failed', 'manual', 'held'] as const) {
      expect(TR_LABEL[status].length).toBeGreaterThan(0);
      expect(TR_TONE[status]).toBeTruthy();
    }
    for (const status of [
      'draft',
      'pending_approval',
      'approved',
      'executing',
      'completed',
      'partial',
      'cancelled',
    ] as const) {
      expect(PR_LABEL[status].length).toBeGreaterThan(0);
      expect(PR_TONE[status]).toBeTruthy();
    }
  });

  test('order progress collapses payment and hold onto the approved step', () => {
    expect(ORDER_STEPS).toEqual([
      'submitted',
      'approved',
      'paid',
      'allocated',
      'in_collection',
      'delivered',
      'closed',
    ]);
    expect(orderStepIndex('submitted')).toBe(0);
    expect(orderStepIndex('approved')).toBe(1);
    expect(orderStepIndex('awaiting_payment')).toBe(1);
    expect(orderStepIndex('held')).toBe(1);
    expect(orderStepIndex('closed')).toBe(6);
    expect(orderStepIndex('draft')).toBe(-1);
    expect(orderStepIndex('cancelled')).toBe(-1);
  });
});

describe('collection and allocation', () => {
  test('a delivered or closed order cannot take another farm stop', () => {
    expect(allocationClosed('delivered')).toBe(true);
    expect(allocationClosed('closed')).toBe(true);
    expect(allocationClosed('allocated', 'delivered')).toBe(true);
    expect(allocationClosed('allocated', 'closed')).toBe(true);
    expect(allocationClosed('paid', 'planned')).toBe(false);
    expect(allocationClosed('in_collection', 'in_progress')).toBe(false);
  });

  test('the truck leaves only when every live sale is in the cold box, or nothing remains', () => {
    expect(
      stopCollection([
        consignment({ id: 'a', status: 'cold_boxed', plannedKg: 10 }),
        consignment({ id: 'b', status: 'in_transit', plannedKg: 10 }),
      ]),
    ).toEqual({ ready: true, nothingToCollect: false });
    expect(
      stopCollection([
        consignment({ id: 'a', status: 'cold_boxed', plannedKg: 10 }),
        consignment({ id: 'b', status: 'captured', plannedKg: 10 }),
      ]),
    ).toEqual({ ready: false, nothingToCollect: false });
    expect(
      stopCollection([
        consignment({ id: 'a', status: 'declined', plannedKg: 10 }),
        consignment({ id: 'b', status: 'cancelled', plannedKg: 10 }),
      ]),
    ).toEqual({ ready: false, nothingToCollect: true });
    expect(stopCollection([])).toEqual({ ready: false, nothingToCollect: false });
  });

  test('checkpoint labels name the stop when one is known', () => {
    expect(checkpointLabel('load')).toBe('Load · node');
    expect(checkpointLabel('farm_stop', 'Adeiso')).toBe('Stop · Adeiso');
    expect(checkpointLabel('arrival')).toBe('Arrival · buyer');
    expect(checkpointLabel('handover')).toBe('Handover');
    expect(checkpointLabel('custom')).toBe('custom');
  });
});

describe('payout approval', () => {
  test('two sign-offs are required above the threshold or when a correction is included', () => {
    expect(payoutRequiresTwo(2000, 2000, false)).toBe(false);
    expect(payoutRequiresTwo(2000.01, 2000, false)).toBe(true);
    expect(payoutRequiresTwo(10, 2000, true)).toBe(true);
  });

  test('the creator counts as one approver and cannot approve twice', () => {
    const pending = run({
      requiresTwo: true,
      approvals: [{ userId: 'OU1', name: 'Ama Owusu', at: NOW }],
    });
    expect(approvalsNeeded(pending)).toBe(2);
    expect(payoutReady(pending)).toBe(false);
    expect(approvalStillOpen(pending)).toBe(true);
    expect(canApprove(pending, 'OU1', ['OU2'])).toEqual({
      ok: false,
      why: 'Already approved by this user.',
    });
    expect(canApprove(pending, 'OU2', ['OU2'])).toEqual({ ok: true, why: '' });

    const approved = run({
      ...pending,
      approvals: [
        { userId: 'OU1', name: 'Ama Owusu', at: NOW },
        { userId: 'OU2', name: 'Will McCoy II', at: NOW },
      ],
      status: 'approved',
    });
    expect(payoutReady(approved)).toBe(true);
    expect(canApprove(approved, 'OU3', [])).toEqual({
      ok: false,
      why: 'This run is not waiting for approval.',
    });
  });

  test('a single-approval run is ready once its creator is recorded', () => {
    const sole = run({
      requiresTwo: false,
      status: 'approved',
      approvals: [{ userId: 'OU1', name: 'Ama Owusu', at: NOW }],
    });
    expect(approvalsNeeded(sole)).toBe(1);
    expect(payoutReady(sole)).toBe(true);
  });

  test('draft, cancelled, and completed runs are closed to further approval', () => {
    expect(payoutReady(run({ status: 'draft', requiresTwo: false }))).toBe(false);
    expect(payoutReady(run({ status: 'cancelled', requiresTwo: false }))).toBe(false);
    expect(approvalStillOpen(run({ status: 'cancelled' }))).toBe(false);
    expect(approvalStillOpen(run({ status: 'completed', requiresTwo: false }))).toBe(false);
    expect(payoutReady(run({ status: 'executing', requiresTwo: false, approvals: [] }))).toBe(true);
  });
});

describe('wallets, transfers, and ids', () => {
  test('wallet limits follow the farmer tier', () => {
    expect(walletLimitFor(farmer({ tier: 'minimum' }), limits)).toBe(3000);
    expect(walletLimitFor(farmer({ tier: 'medium' }), limits)).toBe(15000);
    expect(walletLimitFor(farmer({ tier: 'enhanced' }), limits)).toBe(25000);
    expect(walletLimitFor(farmer({ tier: 'unknown' }), limits)).toBe(3000);
  });

  test('the simulated provider fails a missing farmer or a bad wallet', () => {
    const transfer = {
      id: 'TR-1',
      idempotencyKey: 'a1b2c3d4-7001',
    } as Transfer;
    expect(simulateTransfer(transfer, undefined)).toEqual({
      status: 'failed',
      error: 'Farmer record missing',
    });
    expect(simulateTransfer(transfer, farmer({ walletBad: true }))).toEqual({
      status: 'failed',
      error: 'Wallet number not registered on network',
    });
    expect(simulateTransfer(transfer, farmer())).toEqual({
      status: 'succeeded',
      providerRef: 'PSK-A1B2C3D4',
    });
  });

  test('ids and run assignment accept the device id or the older display name', () => {
    expect(nextId('CS', 7)).toBe('CS-0007');
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const device = { id: 'DEV-D1', userName: 'Yaw Mensah' } as Device;
    expect(runAssignedTo('DEV-D1', device)).toBe(true);
    expect(runAssignedTo('Yaw Mensah', device)).toBe(true);
    expect(runAssignedTo('Kojo Antwi', device)).toBe(false);
    const devices = [
      { id: 'DEV-A1', userName: 'Kojo Antwi' },
      { id: 'DEV-D1', userName: 'Yaw Mensah' },
    ] as Device[];
    expect(assignedStaffName(devices, 'DEV-A1')).toBe('Kojo Antwi');
    expect(assignedStaffName(devices, 'Yaw Mensah')).toBe('Yaw Mensah');
    expect(assignedStaffName(devices, 'someone else')).toBe('someone else');
  });
});
