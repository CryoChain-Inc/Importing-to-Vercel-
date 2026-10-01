import type {
  Config,
  Consignment,
  Device,
  Farmer,
  Order,
  OrderStatus,
  PayoutRun,
  Settlement,
  SettlementStatus,
  State,
  Transfer,
} from './types';

// Uses exponential notation to avoid IEEE 754 floating point rounding errors (e.g. 1.005).
export const round2 = (n: number) => Number(`${Math.round(Number(`${n}e2`))}e-2`) || 0;
export const ghs = (n: number, sign = false) =>
  `${sign && n < 0 ? '− ' : ''}GHS ${Math.abs(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num2 = (n: number) =>
  n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const kg = (n: number) => `${n.toLocaleString('en-GH', { maximumFractionDigits: 1 })} kg`;
export const maskMomo = (m: string) => `••• ••• •${m.slice(-3)}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fmtTime = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const fmtStamp = (t: number) => {
  const d = new Date(t);
  return `${fmtTime(t)} · ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const fmtDay = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const fmtDayLong = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  const L = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return `${L[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
export const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDay(d.getTime());
};
export const H = 3600_000;
export function countdown(deadline: number, now = Date.now()) {
  const diff = deadline - now;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / H);
  const m = Math.floor((abs % H) / 60000);
  if (diff < 0)
    return { text: `Overdue ${h} h ${String(m).padStart(2, '0')} m`, tone: 'alert' as const };
  return {
    text: `${h} h ${String(m).padStart(2, '0')} m left`,
    tone: h < 4 ? ('warn' as const) : ('ok' as const),
  };
}
export function expiresIn(deadline: number, now = Date.now()) {
  const diff = Math.max(0, deadline - now);
  const h = Math.floor(diff / H);
  const m = Math.floor((diff % H) / 60000);
  return `${h} h ${String(m).padStart(2, '0')} m`;
}

export type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'alert';
export const ORDER_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  awaiting_payment: 'Awaiting confirmation',
  paid: 'Paid',
  allocated: 'Allocated',
  in_collection: 'In collection',
  delivered: 'Delivered',
  closed: 'Closed',
  expired: 'Expired',
  cancelled: 'Cancelled',
  held: 'Mismatch held',
};
export const ORDER_TONE: Record<OrderStatus, Tone> = {
  draft: 'neutral',
  submitted: 'neutral',
  approved: 'info',
  awaiting_payment: 'warn',
  paid: 'ok',
  allocated: 'info',
  in_collection: 'info',
  delivered: 'ok',
  closed: 'neutral',
  expired: 'neutral',
  cancelled: 'neutral',
  held: 'alert',
};
export const ORDER_STEPS: OrderStatus[] = [
  'submitted',
  'approved',
  'paid',
  'allocated',
  'in_collection',
  'delivered',
  'closed',
];
export function orderStepIndex(s: OrderStatus) {
  const map: Partial<Record<OrderStatus, number>> = {
    submitted: 0,
    approved: 1,
    awaiting_payment: 1,
    held: 1,
    paid: 2,
    allocated: 3,
    in_collection: 4,
    delivered: 5,
    closed: 6,
  };
  return map[s] ?? -1;
}
export const CONS_LABEL: Record<Consignment['status'], string> = {
  planned: 'Pending',
  captured: 'Captured',
  cold_boxed: 'In cold box',
  declined: 'Declined',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
export const CONS_TONE: Record<Consignment['status'], Tone> = {
  planned: 'neutral',
  captured: 'ok',
  cold_boxed: 'ok',
  declined: 'alert',
  in_transit: 'info',
  delivered: 'ok',
  cancelled: 'neutral',
};
export const SETT_LABEL: Record<SettlementStatus, string> = {
  pending_delivery: 'Pending delivery',
  payable: 'Payable',
  held: 'Held',
  in_run: 'In run',
  paid: 'Paid',
  failed: 'Failed',
  corrected: 'Corrected',
};
export const SETT_TONE: Record<SettlementStatus, Tone> = {
  pending_delivery: 'neutral',
  payable: 'info',
  held: 'warn',
  in_run: 'info',
  paid: 'ok',
  failed: 'alert',
  corrected: 'warn',
};
export const TR_LABEL: Record<Transfer['status'], string> = {
  queued: 'Queued',
  sent: 'Sent',
  succeeded: 'Paid',
  failed: 'Failed',
  manual: 'Paid manually',
  held: 'Held',
};
export const TR_TONE: Record<Transfer['status'], Tone> = {
  queued: 'neutral',
  sent: 'info',
  succeeded: 'ok',
  failed: 'alert',
  manual: 'ok',
  held: 'warn',
};
export const PR_LABEL: Record<PayoutRun['status'], string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  executing: 'Executing',
  completed: 'Completed',
  partial: 'Partial',
  cancelled: 'Cancelled',
};
export const PR_TONE: Record<PayoutRun['status'], Tone> = {
  draft: 'neutral',
  pending_approval: 'warn',
  approved: 'info',
  executing: 'info',
  completed: 'ok',
  partial: 'warn',
  cancelled: 'neutral',
};

/**
 * Computes farmer payment snapshot fixed at farm-gate capture.
 * Shielding rule: Delivery rejections or transit shrinkage never reduce the farmer's locked settlement.
 */
export function computeSettlement(farmGateKg: number, pricePerKg: number, deductions = 0) {
  if (!(farmGateKg > 0)) throw new Error('Weight must be above zero');
  const gross = round2(farmGateKg * pricePerKg);
  const net = round2(gross - deductions);
  return { gross, deductions, net };
}

/**
 * Calculates current line fulfillment to detect shortfalls when re-cutting allocations.
 */
export function lineCoverage(line: { qtyKg: number }, cons: Consignment[]) {
  const covered = cons
    .filter((c) => c.status !== 'cancelled' && c.status !== 'declined')
    .reduce((s, c) => s + (c.farmGateKg ?? c.plannedKg), 0);
  return { covered: round2(covered), shortfall: round2(Math.max(0, line.qtyKg - covered)) };
}
export function isShort(c: Consignment, tolerancePct: number) {
  return c.farmGateKg !== undefined && c.farmGateKg < c.plannedKg * (1 - tolerancePct / 100);
}

/**
 * Dual-control rule: Payout runs exceeding the threshold OR containing manual corrections require two sign-offs.
 */
export function payoutRequiresTwo(total: number, threshold: number, hasCorrection: boolean) {
  return total > threshold || hasCorrection;
}

/**
 * Segregation of duties check: The user who created the payout run cannot approve it.
 */
export function canApprove(run: PayoutRun, userId: string, approverIds: string[]) {
  if (run.createdBy === userId)
    return { ok: false, why: 'The person who raised a run cannot approve it.' };
  if (!approverIds.includes(userId)) return { ok: false, why: 'Not a named approver.' };
  if (run.approvals.some((a) => a.userId === userId))
    return { ok: false, why: 'Already approved by this user.' };
  return { ok: true, why: '' };
}
export function approvalsNeeded(run: PayoutRun) {
  return run.requiresTwo ? 2 : 1;
}
export function walletLimitFor(f: Farmer, cfg: Config) {
  if (f.tier === 'minimum') return cfg.walletLimits.minimum;
  if (f.tier === 'medium') return cfg.walletLimits.medium;
  if (f.tier === 'enhanced') return cfg.walletLimits.enhanced;
  return cfg.walletLimits.minimum;
}
// Simulated provider: succeeds unless the wallet is flagged bad.
export function simulateTransfer(
  t: Transfer,
  f: Farmer | undefined,
): { status: Transfer['status']; providerRef?: string; error?: string } {
  if (!f) return { status: 'failed', error: 'Farmer record missing' };
  if (f.walletBad) return { status: 'failed', error: 'Wallet number not registered on network' };
  return { status: 'succeeded', providerRef: `PSK-${t.idempotencyKey.slice(0, 8).toUpperCase()}` };
}
export function orderLinesTotal(lines: { total: number }[]) {
  return round2(lines.reduce((s, l) => s + l.total, 0));
}
export function creditBalance(state: State, orgId: string) {
  const credits = state.ledger
    .filter(
      (l) =>
        l.kind === 'credit_note' && state.orders.find((o) => o.id === l.orderId)?.orgId === orgId,
    )
    .reduce((s, l) => s + l.amount, 0);
  const used = state.orders
    .filter(
      (o) =>
        o.orgId === orgId &&
        o.status !== 'draft' &&
        o.status !== 'cancelled' &&
        o.status !== 'expired',
    )
    .reduce((s, o) => s + o.creditApplied, 0);
  return round2(credits - used);
}
export function orderById(state: State, id: string): Order | undefined {
  return state.orders.find((o) => o.id === id);
}
/**
 * SLA rule: Farmers must receive payment within 24 hours of successful delivery to the buyer.
 */
export function settlementDeadline(payableAt: number) {
  return payableAt + 24 * H;
}
export function checkpointLabel(cp: string, stopLabel?: string) {
  return (
    (
      {
        load: 'Load · node',
        farm_stop: `Stop · ${stopLabel ?? ''}`,
        depart_last: 'Departure · last stop',
        arrival: `Arrival · ${stopLabel ?? 'buyer'}`,
        handover: 'Handover',
      } as Record<string, string>
    )[cp] ?? cp
  );
}
export function nextId(prefix: string, n: number) {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}
export function uuid() {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/** A run belongs to the handset Ops picked. Older runs stored the display name instead of the device id. */
export function runAssignedTo(assigned: string, device: Pick<Device, 'id' | 'userName'>) {
  return assigned === device.id || assigned === device.userName;
}

export function assignedStaffName(devices: Device[], assigned: string) {
  return (
    devices.find((d) => d.id === assigned)?.userName ??
    devices.find((d) => d.userName === assigned)?.userName ??
    assigned
  );
}
