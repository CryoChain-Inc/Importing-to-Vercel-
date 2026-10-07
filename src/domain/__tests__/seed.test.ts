import { buildSeed, emptyOperatingState } from '../seed';
import { computeSettlement, orderLinesTotal, round2 } from '../logic';

const NOW = Date.UTC(2026, 9, 7, 8, 0, 0);

describe('seed data', () => {
  const state = buildSeed(NOW);

  test('every order total is the line total minus credit', () => {
    expect(state.orders.length).toBeGreaterThan(0);
    for (const order of state.orders) {
      expect(order.linesTotal).toBe(orderLinesTotal(order.lines));
      expect(order.total).toBe(round2(order.linesTotal - order.creditApplied));
      expect(order.lines.every((line) => line.total === round2(line.qtyKg * line.unitPrice))).toBe(
        true,
      );
    }
  });

  test('every settlement matches the farm-gate weight locked at capture', () => {
    expect(state.settlements.length).toBeGreaterThan(0);
    for (const settlement of state.settlements) {
      const expected = computeSettlement(
        settlement.payableKg,
        settlement.pricePerKg,
        settlement.deductions,
      );
      expect(settlement.gross).toBe(expected.gross);
      expect(settlement.net).toBe(expected.net);
      if (settlement.payableAt)
        expect(settlement.deadlineAt).toBe(settlement.payableAt + 24 * 3600_000);
    }
  });

  test('catalog prices and payout rules are present', () => {
    expect(state.products.every((product) => product.grades.length > 0)).toBe(true);
    expect(state.config.payoutThreshold).toBe(2000);
    expect(state.config.tolerancePct).toBe(5);
    expect(state.config.walletLimits).toEqual({ minimum: 3000, medium: 15000, enhanced: 25000 });
    expect(state.config.farmGatePrice.tomato).toBe(4.5);
    expect(state.session.buyerUserId).toBe('U3');
    expect(state.session.opsUserId).toBe('OU1');
  });

  test('a new node starts from the catalog with no customers or money', () => {
    const empty = emptyOperatingState(NOW);
    expect(empty.products).toEqual(state.products);
    expect(empty.orders).toEqual([]);
    expect(empty.farmers).toEqual([]);
    expect(empty.consignments).toEqual([]);
    expect(empty.settlements).toEqual([]);
    expect(empty.payoutRuns).toEqual([]);
    expect(empty.transfers).toEqual([]);
    expect(empty.ledger).toEqual([]);
    expect(empty.opsUsers).toEqual([]);
    expect(empty.config.approverIds).toEqual([]);
    expect(empty.config.payoutThreshold).toBe(state.config.payoutThreshold);
    expect(empty.session.opsUserId).toBe('');
    expect(empty.seq).toBe(1000);
  });
});
