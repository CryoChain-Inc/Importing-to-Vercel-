import { describe, expect, it } from 'vitest';
import { approvalsNeeded, canApprove, computeSettlement, isShort, lineCoverage, payoutRequiresTwo, round2, simulateTransfer, walletLimitFor } from '../domain/logic';
import { buildSeed } from '../domain/seed';
import type { Consignment, Farmer, PayoutRun, Transfer } from '../domain/types';

const cons = (over: Partial<Consignment>): Consignment => ({ id: 'c', orderId: 'o', lineId: 'l', farmerId: 'f', productId: 'tomato', productName: 'Tomato', plannedKg: 400, pricePerKg: 4.5, photos: [], status: 'planned', version: 1, ...over });

describe('settlement is fixed at the farm gate', () => {
  it('computes gross and net from farm gate kg and the price snapshot, rounded half up to the pesewa', () => {
    expect(computeSettlement(298.5, 4.5)).toEqual({ gross: 1343.25, deductions: 0, net: 1343.25 });
    expect(computeSettlement(33.3, 4.55).gross).toBe(151.52);
    expect(round2(0.125)).toBe(0.13);
  });
  it('rejects a zero or negative weight', () => { expect(() => computeSettlement(0, 4.5)).toThrow(); expect(() => computeSettlement(-1, 4.5)).toThrow(); });
});

describe('allocation coverage and re-cut', () => {
  it('reports the shortfall when one consignment captures short', () => {
    const list = [cons({ id: 'a', plannedKg: 400, farmGateKg: 320, status: 'cold_boxed' }), cons({ id: 'b', plannedKg: 350 }), cons({ id: 'c', plannedKg: 300 }), cons({ id: 'd', plannedKg: 300 }), cons({ id: 'e', plannedKg: 250 }), cons({ id: 'f', plannedKg: 250 }), cons({ id: 'g', plannedKg: 150 })];
    expect(lineCoverage({ qtyKg: 2000 }, list)).toEqual({ covered: 1920, shortfall: 80 });
  });
  it('an eighth farmer for 80 kg brings coverage back to the order and leaves captured consignments untouched', () => {
    const captured = cons({ id: 'a', plannedKg: 400, farmGateKg: 320, status: 'cold_boxed' });
    const list = [captured, cons({ id: 'b', plannedKg: 1600 }), cons({ id: 'h', plannedKg: 80, version: 2 })];
    expect(lineCoverage({ qtyKg: 2000 }, list).shortfall).toBe(0);
    expect(captured.farmGateKg).toBe(320);
  });
  it('ignores declined and cancelled consignments', () => { expect(lineCoverage({ qtyKg: 100 }, [cons({ plannedKg: 100, status: 'declined' })]).shortfall).toBe(100); });
  it('flags short only beyond the tolerance', () => { expect(isShort(cons({ plannedKg: 400, farmGateKg: 385 }), 5)).toBe(false); expect(isShort(cons({ plannedKg: 400, farmGateKg: 320 }), 5)).toBe(true); });
});

describe('payout approval rules', () => {
  const run: PayoutRun = { id: 'PR-1', createdBy: 'OU1', createdByName: 'Ama', createdAt: 0, total: 2298.25, count: 3, threshold: 2000, requiresTwo: true, approvals: [], status: 'pending_approval', transferIds: [] };
  it('needs two approvers above the threshold or for any correction', () => { expect(payoutRequiresTwo(2298.25, 2000, false)).toBe(true); expect(payoutRequiresTwo(1500, 2000, false)).toBe(false); expect(payoutRequiresTwo(10, 2000, true)).toBe(true); expect(approvalsNeeded(run)).toBe(2); });
  it('the creator can never approve their own run', () => { expect(canApprove(run, 'OU1', ['OU1', 'OU2', 'OU3']).ok).toBe(false); });
  it('only named approvers approve, and the same user cannot approve twice', () => {
    expect(canApprove(run, 'OU9', ['OU2', 'OU3']).ok).toBe(false);
    expect(canApprove(run, 'OU2', ['OU2', 'OU3']).ok).toBe(true);
    expect(canApprove({ ...run, approvals: [{ userId: 'OU2', name: 'Will', at: 1 }] }, 'OU2', ['OU2', 'OU3']).ok).toBe(false);
    expect(canApprove({ ...run, approvals: [{ userId: 'OU2', name: 'Will', at: 1 }] }, 'OU3', ['OU2', 'OU3']).ok).toBe(true);
  });
});

describe('transfers', () => {
  const t: Transfer = { id: 'TR-1', runId: 'PR-1', settlementId: 'ST-1', farmerId: 'F6', momo: '0267001234', network: 'AirtelTigo', amount: 640, idempotencyKey: 'k1', status: 'queued', attempts: 0 };
  const good: Farmer = { id: 'F1', code: 'FM', name: 'A', momo: '0244009999', network: 'MTN', tier: 'medium', kyc: 'unverified', village: 'v', consentAt: 0, registeredBy: 'x' };
  it('a flagged wallet fails alone and a good wallet succeeds with a provider reference', () => { expect(simulateTransfer(t, { ...good, walletBad: true }).status).toBe('failed'); const r = simulateTransfer(t, good); expect(r.status).toBe('succeeded'); expect(r.providerRef).toMatch(/^FLW-/); });
  it('wallet tier limits come from config and unknown tiers use the minimum', () => { const cfg = buildSeed().config; expect(walletLimitFor({ ...good, tier: 'minimum' }, cfg)).toBe(3000); expect(walletLimitFor({ ...good, tier: 'unknown' }, cfg)).toBe(3000); expect(walletLimitFor({ ...good, tier: 'enhanced' }, cfg)).toBe(25000); });
});

describe('seed invariants', () => {
  const s = buildSeed();
  it('every consignment belongs to exactly one farmer and one order line that exists', () => { for (const c of s.consignments) { expect(s.farmers.some(f => f.id === c.farmerId)).toBe(true); const o = s.orders.find(x => x.id === c.orderId)!; expect(o.lines.some(l => l.id === c.lineId)).toBe(true); } });
  it('every settlement equals kg times price of its consignment with no deduction', () => { for (const st of s.settlements) { const c = s.consignments.find(x => x.id === st.consignmentId)!; expect(st.net).toBe(round2(c.farmGateKg! * c.pricePerKg)); expect(st.deductions).toBe(0); } });
  it('the reference order allocates 2,000 kg across seven farmers with 400, 350, 300, 300, 250, 250 and 150', () => { const kgs = s.consignments.filter(c => c.orderId === 'CC-2410').map(c => c.plannedKg); expect(kgs).toEqual([400, 350, 300, 300, 250, 250, 150]); expect(kgs.reduce((a, b) => a + b, 0)).toBe(2000); });
  it('order totals are lines minus credit', () => { for (const o of s.orders) expect(o.total).toBe(round2(o.linesTotal - o.creditApplied)); });
});
