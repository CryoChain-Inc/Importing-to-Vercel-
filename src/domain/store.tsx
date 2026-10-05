import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View, Text, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  BuyerRole,
  Checkpoint,
  Consignment,
  DeviceEvent,
  Exception,
  ExceptionType,
  Farmer,
  OrderLine,
  Settlement,
  State,
  Transfer,
} from './types';
import { buildSeed } from './seed';
import {
  H,
  approvalsNeeded,
  canApprove,
  computeSettlement,
  creditBalance,
  addDays,
  fmtDay,
  ghs,
  isIsoDay,
  isoDay,
  isShort,
  maskMomo,
  payoutRequiresTwo,
  round2,
  simulateTransfer,
  uuid,
  walletLimitFor,
} from './logic';
import { remoteEnabled } from '../backend/config';
import {
  commit,
  dispatchSms,
  dispatchTransfer,
  startCheckout,
  stateForNewNode,
  verifyTransfer,
} from '../backend/remote';
import { readPosition } from '../backend/media';

const KEY = 'cryochain-proto-v5';
/** How long a sent payout may wait for its webhook before the app polls Paystack for it. */
const VERIFY_AFTER = 90 * 1000;
const clone = <T,>(v: T): T =>
  typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v));
async function load(): Promise<State> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as State;
      if (s.seededAt && Date.now() - s.seededAt < 36 * H) return s;
    }
  } catch {
    /* ignore */
  }
  return buildSeed();
}
function save(s: State) {
  AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {
    /* ignore */
  });
}

// ---------- helpers (mutating, used inside mutate()) ----------
const nid = (s: State, prefix: string) => `${prefix}-${++s.seq}`;
const audit = (s: State, actor: string, action: string, entity: string, detail?: string) => {
  s.audit.unshift({ id: nid(s, 'AU'), at: Date.now(), actor, action, entity, detail });
};
const render = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
function sendSms(
  s: State,
  f: Farmer | undefined,
  template: string,
  vars: Record<string, string | number>,
) {
  if (!f) return;
  const to = f.phone ?? `+233 ${f.momo.slice(1, 3)} ${f.momo.slice(3, 6)} ${f.momo.slice(6)}`;
  const key = `${template}:${vars.dedupe ?? ''}`;
  if (vars.dedupe && s.sms.some((m) => m.ref.endsWith(key))) return;
  s.sms.unshift({
    id: nid(s, 'SM'),
    to,
    farmerId: f.id,
    template,
    body: render(s.config.smsTemplates[template] ?? template, vars),
    at: Date.now(),
    status: remoteEnabled ? 'queued' : 'sent',
    ref: remoteEnabled
      ? `QUEUED:${key}`
      : `HUB-${Math.floor(90000 + Math.random() * 9999)}${vars.dedupe ? ':' + key : ''}`,
  });
}
function openException(
  s: State,
  type: ExceptionType,
  severity: Exception['severity'],
  title: string,
  detail: string,
  entity?: { type: string; id: string },
  deadlineAt?: number,
  payload?: Record<string, unknown>,
) {
  const ex: Exception = {
    id: nid(s, 'EX'),
    type,
    severity,
    title,
    detail,
    entity,
    openedAt: Date.now(),
    deadlineAt,
    status: 'open',
    payload,
  };
  s.exceptions.unshift(ex);
  return ex;
}
const farmer = (s: State, id: string) => s.farmers.find((f) => f.id === id);
const order = (s: State, id: string) => s.orders.find((o) => o.id === id);
const cons = (s: State, id: string) => s.consignments.find((c) => c.id === id);
const device = (s: State, id: string) => s.devices.find((d) => d.id === id)!;
const opsName = (s: State) => s.opsUsers.find((u) => u.id === s.session.opsUserId)?.name ?? 'Ops';

function createSettlement(s: State, c: Consignment) {
  if (s.settlements.some((x) => x.consignmentId === c.id && !x.correctionOf)) return;
  const { gross, deductions, net } = computeSettlement(c.farmGateKg!, c.pricePerKg);
  const st: Settlement = {
    id: nid(s, 'ST'),
    consignmentId: c.id,
    farmerId: c.farmerId,
    orderId: c.orderId,
    payableKg: c.farmGateKg!,
    pricePerKg: c.pricePerKg,
    gross,
    deductions,
    net,
    createdAt: c.coldBoxAt ?? Date.now(),
    status: 'pending_delivery',
  };
  // Conflict handling: If ops cancelled the consignment while the field agent captured it offline,
  // do not silently discard either; hold payment and open a high-severity review exception.
  if (c.status === 'cancelled') {
    st.status = 'held';
    st.heldReason = 'Sync conflict: ops cancelled this consignment while it was captured offline';
    openException(
      s,
      'sync_conflict_pay_affecting',
      'high',
      `Conflict · ${c.productName} from ${farmer(s, c.farmerId)?.name}`,
      'Ops re-cut this consignment while the agent captured it offline. Both versions are kept. The settlement is held until the node manager decides.',
      { type: 'consignment', id: c.id },
      undefined,
      {
        agent: { farmGateKg: c.farmGateKg, grade: c.grade, coldBoxAt: c.coldBoxAt },
        ops: { status: 'cancelled', version: c.version },
      },
    );
  } else if (c.adHoc && !c.adHocConfirmed) {
    st.status = 'held';
    st.heldReason = 'Ad hoc consignment awaiting ops confirmation';
    openException(
      s,
      'ad_hoc_consignment',
      'medium',
      `Ad hoc · ${c.productName} from ${farmer(s, c.farmerId)?.name}`,
      `${c.farmGateKg} kg captured at a farm not on the manifest. Confirm against the order allocation before the settlement becomes payable.`,
      { type: 'consignment', id: c.id },
    );
  }
  s.settlements.unshift(st);
}
/**
 * Activates pending settlements upon buyer delivery, starting the 24-hour payout countdown.
 */
function makePayable(s: State, orderId: string, at: number) {
  s.settlements
    .filter((x) => x.orderId === orderId && x.status === 'pending_delivery')
    .forEach((x) => {
      x.status = 'payable';
      x.payableAt = at;
      x.deadlineAt = at + 24 * H;
    });
}
// server-side effects, run when an event is received (online immediately, or at sync)
function applyEffects(s: State, ev: DeviceEvent) {
  const p = ev.payload as Record<string, string | number | undefined>;
  switch (ev.type) {
    case 'farmer.registered': {
      const f = farmer(s, String(p.farmerId));
      if (f) {
        f.pendingSync = false;
        sendSms(s, f, 'farmer_registered', {
          name: f.name.split(' ')[0],
          code: f.code,
          dedupe: f.id,
        });
      }
      break;
    }
    case 'farmer.availability_recorded':
      break;
    case 'consignment.captured': {
      const c = cons(s, String(p.consignmentId));
      if (!c) break;
      c.pendingSync = false;
      if (c.short) {
        const short = round2(c.plannedKg - (c.farmGateKg ?? 0));
        openException(
          s,
          'consignment_short',
          'medium',
          `Short · ${c.productName} from ${farmer(s, c.farmerId)?.name}`,
          `${c.farmGateKg} kg captured against ${c.plannedKg} kg planned. Shortfall ${short} kg on ${c.orderId}. Re-cut the allocation.`,
          { type: 'order', id: c.orderId },
          undefined,
          { orderId: c.orderId, lineId: c.lineId, shortfall: short },
        );
      }
      break;
    }
    case 'consignment.cold_boxed': {
      const c = cons(s, String(p.consignmentId));
      if (!c) break;
      c.pendingSync = false;
      createSettlement(s, c);
      const f = farmer(s, c.farmerId);
      if (f)
        sendSms(s, f, 'consignment_captured', {
          kg: c.farmGateKg ?? 0,
          product: c.productName,
          grade: c.grade ?? '',
          amount: ghs(round2((c.farmGateKg ?? 0) * c.pricePerKg)),
          dedupe: c.id,
        });
      break;
    }
    case 'consignment.declined': {
      const c = cons(s, String(p.consignmentId));
      if (!c) break;
      c.pendingSync = false;
      openException(
        s,
        'farmer_no_show',
        'medium',
        `Declined · ${c.productName} from ${farmer(s, c.farmerId)?.name}`,
        `${c.plannedKg} kg planned on ${c.orderId}. Reason: ${c.declineReason}. Re-cut the allocation.`,
        { type: 'order', id: c.orderId },
        undefined,
        { orderId: c.orderId, lineId: c.lineId, shortfall: c.plannedKg },
      );
      break;
    }
    case 'consignment.correction_requested': {
      const c = cons(s, String(p.consignmentId));
      if (!c) break;
      openException(
        s,
        'sync_conflict_pay_affecting',
        'medium',
        `Correction requested · ${c.productName} from ${farmer(s, c.farmerId)?.name}`,
        String(p.note ?? ''),
        { type: 'consignment', id: c.id },
      );
      break;
    }
    case 'run.stamp': {
      const r = s.runs.find((x) => x.id === p.runId);
      if (!r) break;
      if (r.status === 'planned') r.status = 'in_progress';
      s.orders
        .filter((o) => o.runId === r.id && o.status === 'allocated')
        .forEach((o) => {
          o.status = 'in_collection';
        });
      s.consignments
        .filter(
          (c) =>
            c.runId === r.id &&
            c.status === 'cold_boxed' &&
            c.stopSeq === Number(p.seq) &&
            p.kind === 'departed',
        )
        .forEach((c) => {
          c.status = 'in_transit';
        });
      break;
    }
    case 'run.temperature_recorded': {
      const tr = s.temps.find((x) => x.id === p.readingId);
      if (!tr) break;
      tr.pendingSync = false;
      if (tr.outOfRange)
        openException(
          s,
          'temperature_out_of_range',
          'high',
          `Out of range · ${tr.runId} ${tr.label}`,
          `${tr.valueC} °C against a ${s.runs.find((r) => r.id === tr.runId)?.tempMin} to ${s.runs.find((r) => r.id === tr.runId)?.tempMax} °C range.${tr.note ? ' Driver note: ' + tr.note : ''}`,
          { type: 'run', id: tr.runId },
        );
      break;
    }
    case 'run.delivered': {
      const d = s.deliveries.find((x) => x.id === p.deliveryId);
      if (!d) break;
      d.pendingSync = false;
      const ids = String(p.orderIds).split(',');
      ids.forEach((oid) => {
        makePayable(s, oid, d.at);
        const o = order(s, oid);
        o?.lines.forEach((l) => {
          // Buyer rejections trigger credit note reviews; farmer payout is protected and remains intact.
          if (l.rejectedKg && l.rejectedKg > 0)
            openException(
              s,
              'delivery_rejection',
              'medium',
              `${oid} · ${l.name} ${l.rejectedKg} kg rejected`,
              `${l.rejectReason ?? 'No reason given'}. Review, issue a credit note if due, and record the disposition. The farmer settlement is unchanged.`,
              { type: 'order', id: oid },
            );
        });
      });
      break;
    }
    default:
      break;
  }
}
function deviceEvent(
  s: State,
  deviceId: string,
  type: string,
  payload: Record<string, unknown>,
  sizeKb = 2,
) {
  const d = device(s, deviceId);
  d.seq += 1;
  const ev: DeviceEvent = {
    id: uuid(),
    deviceId,
    seq: d.seq,
    type,
    occurredAt: Date.now(),
    payload,
    status: 'pending',
    sizeKb,
  };
  // Offline-first: Apply immediately when online; buffer in sequential FIFO outbox when offline.
  if (d.online) {
    ev.receivedAt = Date.now();
    applyEffects(s, ev);
    ev.status = 'applied';
    s.events.unshift(ev);
    d.lastSyncAt = Date.now();
  } else d.outbox.push(ev);
}
function syncDevice(s: State, deviceId: string) {
  const d = device(s, deviceId);
  if (!d.online) return;
  d.outbox
    .sort((a, b) => a.seq - b.seq)
    .forEach((ev) => {
      ev.receivedAt = Date.now();
      try {
        applyEffects(s, ev);
        ev.status = 'applied';
      } catch (e) {
        ev.status = 'error';
      }
      s.events.unshift(ev);
    });
  d.outbox = [];
  d.lastSyncAt = Date.now();
}
function processTransfer(s: State, t: Transfer) {
  // When Supabase is configured, delegate execution to the payout-transfer Edge Function.
  if (remoteEnabled) {
    if (
      t.status === 'succeeded' ||
      t.status === 'manual' ||
      t.status === 'held' ||
      t.status === 'queued' ||
      t.status === 'sent'
    )
      return;
    if (t.status === 'failed' && t.attempts >= 3) return;
    t.status = 'queued';
    t.lastError = undefined;
    return;
  }
  const f = farmer(s, t.farmerId);
  t.attempts += 1;
  t.status = 'sent';
  const r = simulateTransfer(t, f);
  const st = s.settlements.find((x) => x.id === t.settlementId);
  if (r.status === 'succeeded') {
    t.status = 'succeeded';
    t.providerRef = r.providerRef;
    t.at = Date.now();
    if (st) st.status = 'paid';
    s.ledger.unshift({
      id: nid(s, 'LG'),
      kind: 'payout_out',
      direction: 'out',
      amount: t.amount,
      ref: r.providerRef!,
      settlementId: t.settlementId,
      transferId: t.id,
      at: Date.now(),
      by: `Payout run ${t.runId}`,
    });
    sendSms(s, f, 'farmer_paid', {
      amount: ghs(t.amount),
      masked: maskMomo(t.momo),
      ref: r.providerRef!,
      dedupe: t.id,
    });
    s.exceptions
      .filter((e) => e.entity?.id === t.id && (e.status === 'open' || e.status === 'in_progress'))
      .forEach((e) => {
        e.status = 'resolved';
        e.resolution = `Paid on retry, ref ${r.providerRef}`;
        e.resolvedAt = Date.now();
      });
  } else {
    t.status = 'failed';
    t.lastError = r.error;
    if (st) st.status = 'failed';
    if (
      t.attempts >= 3 &&
      !s.exceptions.some((e) => e.entity?.id === t.id && e.status !== 'resolved')
    ) {
      openException(
        s,
        'transfer_failed',
        'high',
        `Transfer failed · ${f?.name ?? t.farmerId} · ${ghs(t.amount)}`,
        `${r.error}. Three attempts made. Fix the wallet number or pay manually before the 24 hour deadline.`,
        { type: 'transfer', id: t.id },
        st?.deadlineAt,
      );
      sendSms(s, f, 'payout_delayed', { amount: ghs(t.amount), dedupe: t.id });
    }
  }
}
function settleRunStatus(s: State, runId: string) {
  const run = s.payoutRuns.find((r) => r.id === runId)!;
  const ts = s.transfers.filter((t) => run.transferIds.includes(t.id));
  if (ts.every((t) => t.status === 'succeeded' || t.status === 'manual')) run.status = 'completed';
  else if (ts.some((t) => t.status === 'queued' || t.status === 'sent')) run.status = 'executing';
  else run.status = 'partial';
  if (run.status !== 'executing' && !run.executedAt) run.executedAt = Date.now();
}

// ---------- actions ----------
function buildActions(get: () => State, mutate: (fn: (s: State) => void) => void) {
  const A = {
    reset() {
      const fresh = buildSeed();
      mutate((s) => {
        Object.assign(s, fresh);
      });
    },
    // session
    setBuyerUser(id: string) {
      mutate((s) => {
        s.session.buyerUserId = id;
      });
    },
    setOpsUser(id: string) {
      mutate((s) => {
        s.session.opsUserId = id;
      });
    },
    setFarmer(id: string) {
      mutate((s) => {
        s.session.farmerId = id;
      });
    },
    // ----- buyer -----
    draftAdd(productId: string, grade: string, qtyKg: number) {
      mutate((s) => {
        const p = s.products.find((x) => x.id === productId)!;
        const unitPrice = p.grades.find((g) => g.grade === grade)!.pricePerKg;
        const ex = s.session.draft.lines.find(
          (l) => l.productId === productId && l.grade === grade,
        );
        if (ex) {
          ex.qtyKg = round2(ex.qtyKg + qtyKg);
          ex.total = round2(ex.qtyKg * unitPrice);
        } else
          s.session.draft.lines.push({
            id: nid(s, 'LN'),
            productId,
            name: p.name,
            grade,
            qtyKg,
            unitPrice,
            total: round2(qtyKg * unitPrice),
          });
      });
    },
    draftRemove(lineId: string) {
      mutate((s) => {
        s.session.draft.lines = s.session.draft.lines.filter((l) => l.id !== lineId);
      });
    },
    draftSet(patch: Partial<{ deliveryDate: string; address: string }>) {
      mutate((s) => {
        Object.assign(s.session.draft, patch);
      });
    },
    draftReorder(orderId: string) {
      mutate((s) => {
        const o = order(s, orderId);
        if (!o) return;
        s.session.draft.lines = o.lines.map((l) => ({
          id: nid(s, 'LN'),
          productId: l.productId,
          name: l.name,
          grade: l.grade,
          qtyKg: l.qtyKg,
          unitPrice: s.products
            .find((p) => p.id === l.productId)!
            .grades.find((g) => g.grade === l.grade)!.pricePerKg,
          total: 0,
        }));
        s.session.draft.lines.forEach((l) => {
          l.total = round2(l.qtyKg * l.unitPrice);
        });
      });
    },
    submitDraft(): string {
      let id = '';
      mutate((s) => {
        const u = s.buyerUsers.find((x) => x.id === s.session.buyerUserId)!;
        const d = s.session.draft;
        if (!d.lines.length) return;
        const linesTotal = round2(d.lines.reduce((a, l) => a + l.total, 0));
        const credit = Math.min(creditBalance(s, u.orgId), linesTotal);
        const n =
          2420 +
          s.orders.filter((o) => o.id.startsWith('CC-24') && Number(o.id.slice(3)) > 2420).length +
          1;
        id = `CC-${n}`;
        s.orders.unshift({
          id,
          orgId: u.orgId,
          requestedBy: u.id,
          deliveryDate: isIsoDay(d.deliveryDate)
            ? d.deliveryDate.slice(0, 10)
            : addDays(isoDay(Date.now()), Number.isFinite(s.config.leadDays) ? s.config.leadDays : 0),
          address: d.address,
          status: 'submitted',
          lines: d.lines.map((l) => ({ ...l })),
          linesTotal,
          creditApplied: round2(credit),
          total: round2(linesTotal - credit),
          submittedAt: Date.now(),
          expiresAt: Date.now() + s.config.paymentExpiryHours * H,
          allocationVersion: 0,
        });
        s.session.draft.lines = [];
        audit(s, u.name, 'Submitted order', id);
      });
      return id;
    },
    approveOrder(orderId: string): { ok: boolean; why?: string } {
      let res = { ok: true as boolean, why: undefined as string | undefined };
      mutate((s) => {
        const o = order(s, orderId)!;
        const u = s.buyerUsers.find((x) => x.id === s.session.buyerUserId)!;
        if (!u.roles.includes('approver') && !u.roles.includes('admin')) {
          res = { ok: false, why: 'Only an approver can approve.' };
          return;
        }
        if (u.limit !== undefined && o.total > u.limit) {
          res = { ok: false, why: `Over your limit of ${ghs(u.limit)}.` };
          return;
        }
        o.status = 'approved';
        o.approvedBy = u.id;
        o.approvedAt = Date.now();
        audit(s, u.name, 'Approved order', o.id);
      });
      return res;
    },
    payOrder(orderId: string, method: 'bank_transfer' | 'card' | 'momo') {
      mutate((s) => {
        const o = order(s, orderId)!;
        if (method === 'bank_transfer' || remoteEnabled) {
          o.status = 'awaiting_payment';
          o.payment = { method, status: 'awaiting', ref: o.id, amount: o.total };
          o.expiresAt = Date.now() + s.config.paymentExpiryHours * H;
        } else {
          o.status = 'paid';
          o.paidAt = Date.now();
          const ref =
            (method === 'card' ? 'CRD-' : 'MTN-') + Math.floor(10000 + Math.random() * 89999);
          o.payment = { method, status: 'confirmed', ref, amount: o.total, at: Date.now() };
          s.ledger.unshift({
            id: nid(s, 'LG'),
            kind: 'payment_in',
            direction: 'in',
            amount: o.total,
            ref,
            orderId: o.id,
            at: Date.now(),
            by: 'Paystack webhook',
          });
        }
      });
    },
    confirmBankPayment(orderId: string, amount: number) {
      mutate((s) => {
        const o = order(s, orderId)!;
        const ref = 'STB-' + Math.floor(70000 + Math.random() * 9999);
        if (round2(amount) === o.total) {
          o.status = 'paid';
          o.paidAt = Date.now();
          o.payment = { method: 'bank_transfer', status: 'confirmed', ref, amount, at: Date.now() };
          s.ledger.unshift({
            id: nid(s, 'LG'),
            kind: 'payment_in',
            direction: 'in',
            amount,
            ref,
            orderId: o.id,
            at: Date.now(),
            by: 'Paystack webhook, verified by status call',
          });
        } else {
          o.status = 'held';
          o.payment = { method: 'bank_transfer', status: 'mismatch', ref, amount, at: Date.now() };
          s.ledger.unshift({
            id: nid(s, 'LG'),
            kind: 'payment_in',
            direction: 'in',
            amount,
            ref,
            orderId: o.id,
            at: Date.now(),
            by: 'Paystack webhook',
            memo: `Mismatch: expected ${ghs(o.total)}`,
          });
          openException(
            s,
            'payment_amount_mismatch',
            'medium',
            `${o.id} · received ${ghs(amount)} against ${ghs(o.total)}`,
            'The order is held. Wait for the balance with the same reference, or refund and cancel.',
            { type: 'order', id: o.id },
          );
        }
      });
    },
    sendBack(orderId: string) {
      mutate((s) => {
        const o = order(s, orderId)!;
        o.status = 'cancelled';
        s.session.draft.lines = o.lines.map((l) => ({ ...l, id: nid(s, 'LN') }));
        audit(
          s,
          s.buyerUsers.find((x) => x.id === s.session.buyerUserId)!.name,
          'Sent order back',
          o.id,
        );
      });
    },
    acceptDelivery(orderId: string) {
      mutate((s) => {
        const o = order(s, orderId)!;
        o.status = 'closed';
        o.acceptedAt = Date.now();
      });
    },
    rejectLine(orderId: string, lineId: string, kg: number, reason: string) {
      mutate((s) => {
        const o = order(s, orderId)!;
        const l = o.lines.find((x) => x.id === lineId)!;
        l.rejectedKg = kg;
        l.rejectReason = reason;
        l.deliveredKg = l.deliveredKg ?? l.qtyKg;
        l.credit = round2(kg * l.unitPrice);
        const ref = `CN-${String(120 + s.ledger.filter((x) => x.kind === 'credit_note').length).padStart(4, '0')}`;
        s.ledger.unshift({
          id: nid(s, 'LG'),
          kind: 'credit_note',
          direction: 'out',
          amount: l.credit,
          ref,
          orderId: o.id,
          at: Date.now(),
          by: 'Buyer dashboard',
          memo: `${l.name} ${kg} kg · ${reason}`,
        });
        openException(
          s,
          'delivery_rejection',
          'medium',
          `${o.id} · ${l.name} ${kg} kg rejected`,
          `${reason}. Credit note ${ref} issued. Record the disposition of the rejected produce. The farmer settlement is unchanged.`,
          { type: 'order', id: o.id },
        );
      });
    },
    issueCredit(orderId: string, lineId: string) {
      mutate((s) => {
        const o = order(s, orderId)!;
        const l = o.lines.find((x) => x.id === lineId)!;
        if (!l.rejectedKg || l.credit) return;
        l.credit = round2(l.rejectedKg * l.unitPrice);
        const ref = `CN-${String(120 + s.ledger.filter((x) => x.kind === 'credit_note').length).padStart(4, '0')}`;
        s.ledger.unshift({
          id: nid(s, 'LG'),
          kind: 'credit_note',
          direction: 'out',
          amount: l.credit,
          ref,
          orderId: o.id,
          at: Date.now(),
          by: opsName(s),
          memo: `${l.name} ${l.rejectedKg} kg · ${l.rejectReason ?? ''} · approved by a second approver`,
        });
        audit(
          s,
          opsName(s),
          'Issued credit note',
          ref,
          `${o.id} ${l.name} ${l.rejectedKg} kg, ${ghs(l.credit)}`,
        );
      });
    },
    inviteUser(orgId: string, name: string, phone: string, role: BuyerRole, limit?: number) {
      mutate((s) => {
        s.buyerUsers.push({
          id: nid(s, 'U'),
          orgId,
          name: name || phone,
          phone,
          roles: [role],
          limit,
          status: 'invited',
        });
      });
    },
    updateUser(
      id: string,
      patch: { roles?: BuyerRole[]; limit?: number; status?: 'active' | 'invited' | 'deactivated' },
    ) {
      mutate((s) => {
        const u = s.buyerUsers.find((x) => x.id === id)!;
        Object.assign(u, patch);
        audit(
          s,
          s.buyerUsers.find((x) => x.id === s.session.buyerUserId)!.name,
          'Updated user',
          u.name,
          JSON.stringify(patch),
        );
      });
    },
    registerOrg(f: {
      name: string;
      type: string;
      country: string;
      address: string;
      contact: string;
      phone: string;
    }) {
      let id = '';
      mutate((s) => {
        id = nid(s, 'O');
        s.orgs.push({
          id,
          name: f.name,
          type: f.type,
          country: f.country,
          address: f.address,
          contact: f.contact,
          status: 'pending',
          submittedAt: Date.now(),
        });
        const uid = nid(s, 'U');
        s.buyerUsers.push({
          id: uid,
          orgId: id,
          name: f.contact.split(',')[0],
          phone: f.phone,
          roles: ['admin', 'approver'],
          status: 'active',
        });
        s.session.buyerUserId = uid;
      });
      return id;
    },
    // ----- ops -----
    approveOrg(id: string) {
      mutate((s) => {
        const o = s.orgs.find((x) => x.id === id)!;
        o.status = 'approved';
        if (!remoteEnabled)
          o.virtualAccount = {
            bank: 'Stanbic Bank Ghana',
            number: `9040 0071 ${Math.floor(2400 + Math.random() * 99)} ${Math.floor(Math.random() * 9)}`,
          };
        audit(s, opsName(s), 'Approved buyer', o.name);
      });
    },
    setVirtualAccount(id: string, bank: string, number: string) {
      mutate((s) => {
        const o = s.orgs.find((x) => x.id === id)!;
        if (!bank.trim() || !number.trim()) return;
        o.virtualAccount = { bank: bank.trim(), number: number.trim() };
        audit(s, opsName(s), 'Recorded dedicated account', o.name, bank.trim());
      });
    },
    allocate(
      orderId: string,
      lineId: string,
      items: { farmerId: string; kg: number; price: number }[],
    ) {
      mutate((s) => {
        const o = order(s, orderId)!;
        const line = o.lines.find((l) => l.id === lineId)!;
        o.allocationVersion += 1;
        items
          .filter((i) => i.kg > 0)
          .forEach((i) => {
            s.consignments.push({
              id: nid(s, 'CS'),
              orderId,
              lineId,
              farmerId: i.farmerId,
              productId: line.productId,
              productName: line.name,
              plannedKg: i.kg,
              pricePerKg: i.price,
              photos: [],
              status: 'planned',
              version: o.allocationVersion,
            });
            sendSms(s, farmer(s, i.farmerId), 'allocation_confirmed', {
              date: fmtDay(o.deliveryDate),
              product: line.name,
              kg: i.kg,
              price: i.price.toFixed(2),
              window: 'in the morning',
              dedupe: `${orderId}:${i.farmerId}:${o.allocationVersion}`,
            });
          });
        if (o.status === 'paid') o.status = 'allocated';
        s.exceptions
          .filter(
            (e) =>
              (e.type === 'consignment_short' || e.type === 'farmer_no_show') &&
              e.payload?.orderId === orderId &&
              e.status !== 'resolved',
          )
          .forEach((e) => {
            e.status = 'resolved';
            e.resolution = `Re-cut, allocation v${o.allocationVersion}`;
            e.resolvedAt = Date.now();
          });
        audit(
          s,
          opsName(s),
          o.allocationVersion > 1 ? 'Re-cut allocation' : 'Allocated order',
          orderId,
          `v${o.allocationVersion}: ${items.map((i) => `${farmer(s, i.farmerId)?.name} ${i.kg} kg @ ${i.price}`).join(', ')}`,
        );
      });
    },
    createRun(input: {
      date: string;
      truck: string;
      driverId: string;
      agentId: string;
      consignmentIds: string[];
      deliveryLabel: string;
      deliveryAddress: string;
    }) {
      let id = '';
      mutate((s) => {
        const driver = s.devices.find((d) => d.id === input.driverId && d.role === 'driver');
        const agent = s.devices.find((d) => d.id === input.agentId && d.role === 'agent');
        if (!driver || !agent) return;
        id = nid(s, 'RUN');
        const stops: State['runs'][number]['stops'] = [];
        const seen = new Map<string, number>();
        input.consignmentIds.forEach((cid) => {
          const c = cons(s, cid)!;
          const f = farmer(s, c.farmerId)!;
          let seq = seen.get(f.id);
          if (!seq) {
            seq = stops.length + 1;
            seen.set(f.id, seq);
            stops.push({
              seq,
              kind: 'farm',
              farmerId: f.id,
              label: f.village,
              address: `${f.village} farm gate`,
              window: `${String(5 + Math.floor((seq - 1) / 2)).padStart(2, '0')}:${(seq - 1) % 2 ? '30' : '00'}–${String(5 + Math.floor(seq / 2)).padStart(2, '0')}:${seq % 2 ? '30' : '00'}`,
            });
          }
          c.runId = id;
          c.stopSeq = seq;
        });
        const orderIds = [...new Set(input.consignmentIds.map((cid) => cons(s, cid)!.orderId))];
        stops.push({
          seq: stops.length + 1,
          kind: 'delivery',
          orderId: orderIds[0],
          orderIds,
          label: input.deliveryLabel,
          address: input.deliveryAddress,
          window: '11:00–12:00',
        });
        s.runs.push({
          id,
          date: input.date,
          truck: input.truck,
          driverId: input.driverId,
          agentId: input.agentId,
          status: 'planned',
          stops,
          tempMin: s.config.tempMin,
          tempMax: s.config.tempMax,
        });
        orderIds.forEach((oid) => {
          const o = order(s, oid)!;
          o.runId = id;
        });
        audit(
          s,
          opsName(s),
          'Created collection run',
          id,
          `${stops.length - 1} farm stops, ${orderIds.join(', ')}, driver ${driver.userName}, agent ${agent.userName}`,
        );
      });
      return id;
    },
    assignRunCrew(runId: string, driverId: string, agentId: string) {
      mutate((s) => {
        const r = s.runs.find((x) => x.id === runId);
        if (!r || r.status !== 'planned') return;
        const driver = s.devices.find((d) => d.id === driverId && d.role === 'driver');
        const agent = s.devices.find((d) => d.id === agentId && d.role === 'agent');
        if (!driver || !agent) return;
        r.driverId = driver.id;
        r.agentId = agent.id;
        audit(
          s,
          opsName(s),
          'Assigned run crew',
          runId,
          `driver ${driver.userName}, agent ${agent.userName}`,
        );
      });
    },
    addToRun(runId: string, consignmentId: string) {
      mutate((s) => {
        const r = s.runs.find((x) => x.id === runId)!;
        const c = cons(s, consignmentId)!;
        const f = farmer(s, c.farmerId)!;
        const del = r.stops.findIndex((x) => x.kind === 'delivery');
        const farmStops = r.stops.filter((x) => x.kind === 'farm');
        const seq = farmStops.length + 1;
        const stop = {
          seq,
          kind: 'farm' as const,
          farmerId: f.id,
          label: f.village,
          address: `${f.village} farm gate`,
          window: 'added',
        };
        r.stops.splice(del < 0 ? r.stops.length : del, 0, stop);
        r.stops.forEach((x, i) => {
          x.seq = i + 1;
        });
        c.runId = r.id;
        c.stopSeq = seq;
        const ds = r.stops.find((x) => x.kind === 'delivery');
        if (ds && !ds.orderIds?.includes(c.orderId))
          ds.orderIds = [...(ds.orderIds ?? []), c.orderId];
        const o = order(s, c.orderId)!;
        o.runId = r.id;
        if (o.status === 'allocated' && r.status === 'in_progress') o.status = 'in_collection';
      });
    },
    confirmAdHoc(consignmentId: string) {
      mutate((s) => {
        const c = cons(s, consignmentId)!;
        c.adHocConfirmed = true;
        const st = s.settlements.find((x) => x.consignmentId === c.id);
        if (st && st.status === 'held') {
          st.status = 'pending_delivery';
          st.heldReason = undefined;
        }
        s.exceptions
          .filter((e) => e.entity?.id === c.id && e.type === 'ad_hoc_consignment')
          .forEach((e) => {
            e.status = 'resolved';
            e.resolution = 'Confirmed against allocation';
            e.resolvedAt = Date.now();
          });
        audit(s, opsName(s), 'Confirmed ad hoc consignment', c.id);
      });
    },
    closeRun(runId: string, reason: string) {
      mutate((s) => {
        const r = s.runs.find((x) => x.id === runId)!;
        r.status = 'closed';
        r.closedReason = reason;
        [...new Set(s.consignments.filter((c) => c.runId === runId).map((c) => c.orderId))].forEach(
          (oid) => makePayable(s, oid, Date.now()),
        );
        audit(s, opsName(s), 'Closed run', runId, reason);
      });
    },
    createPayoutRun(settlementIds: string[]): string {
      let id = '';
      mutate((s) => {
        const u = s.opsUsers.find((x) => x.id === s.session.opsUserId)!;
        const sts = s.settlements.filter(
          (x) => settlementIds.includes(x.id) && x.status === 'payable',
        );
        if (!sts.length) return;
        id = nid(s, 'PR');
        const total = round2(sts.reduce((a, x) => a + x.net, 0));
        const hasCorrection = sts.some((x) => !!x.correctionOf);
        const requiresTwo = payoutRequiresTwo(total, s.config.payoutThreshold, hasCorrection);
        const transferIds: string[] = [];
        sts.forEach((x) => {
          const f = farmer(s, x.farmerId)!;
          const t: Transfer = {
            id: nid(s, 'TR'),
            runId: id,
            settlementId: x.id,
            farmerId: f.id,
            momo: f.momo,
            network: f.network,
            amount: x.net,
            idempotencyKey: uuid(),
            status: 'queued',
            attempts: 0,
          };
          const lim = walletLimitFor(f, s.config);
          if (x.net > lim) {
            t.status = 'held';
            openException(
              s,
              'wallet_limit',
              'medium',
              `Wallet limit · ${f.name} · ${ghs(x.net)}`,
              `Exceeds the ${f.tier} tier daily limit of ${ghs(lim)}. Split across days, move the farmer to a bank account, or upgrade the wallet tier.`,
              { type: 'transfer', id: t.id },
              x.deadlineAt,
            );
          }
          s.transfers.push(t);
          transferIds.push(t.id);
          x.status = 'in_run';
        });
        s.payoutRuns.unshift({
          id,
          createdBy: u.id,
          createdByName: u.name,
          createdAt: Date.now(),
          total,
          count: sts.length,
          threshold: s.config.payoutThreshold,
          requiresTwo,
          approvals: [],
          status: requiresTwo ? 'pending_approval' : 'approved',
          transferIds,
        });
        audit(
          s,
          u.name,
          'Created payout run',
          id,
          `${sts.length} transfers, ${ghs(total)}${requiresTwo ? ', two approvals required' : ''}`,
        );
      });
      return id;
    },
    approvePayoutRun(id: string, note?: string): { ok: boolean; why: string } {
      let res = { ok: true, why: '' };
      mutate((s) => {
        const r = s.payoutRuns.find((x) => x.id === id)!;
        const u = s.opsUsers.find((x) => x.id === s.session.opsUserId)!;
        const c = canApprove(r, u.id, s.config.approverIds);
        if (!c.ok) {
          res = c;
          return;
        }
        r.approvals.push({ userId: u.id, name: u.name, at: Date.now() });
        if (note) r.note = note;
        if (r.approvals.length >= approvalsNeeded(r)) r.status = 'approved';
        audit(s, u.name, 'Approved payout run', id);
      });
      return res;
    },
    rejectPayoutRun(id: string, note: string) {
      mutate((s) => {
        const r = s.payoutRuns.find((x) => x.id === id)!;
        r.status = 'cancelled';
        r.note = note;
        s.transfers
          .filter((t) => r.transferIds.includes(t.id))
          .forEach((t) => {
            t.status = 'failed';
            t.lastError = 'Run rejected';
            const st = s.settlements.find((x) => x.id === t.settlementId);
            if (st) st.status = 'payable';
          });
        audit(s, opsName(s), 'Rejected payout run', id, note);
      });
    },
    executePayoutRun(id: string, crashAfter?: number) {
      mutate((s) => {
        const r = s.payoutRuns.find((x) => x.id === id)!;
        if (r.status !== 'approved' && r.status !== 'executing' && r.status !== 'partial') return;
        r.status = 'executing';
        let n = 0;
        for (const tid of r.transferIds) {
          const t = s.transfers.find((x) => x.id === tid)!;
          if (t.status === 'succeeded' || t.status === 'manual' || t.status === 'held') continue;
          if (t.status === 'failed' && t.attempts >= 3) continue;
          if (crashAfter !== undefined && n >= crashAfter) {
            audit(
              s,
              'Payout worker',
              'Crashed mid run',
              id,
              `${n} transfers processed before the crash`,
            );
            return;
          }
          processTransfer(s, t);
          n++;
        }
        settleRunStatus(s, id);
        audit(s, 'Payout worker', 'Executed payout run', id);
      });
    },
    retryTransfer(id: string) {
      mutate((s) => {
        const t = s.transfers.find((x) => x.id === id)!;
        processTransfer(s, t);
        settleRunStatus(s, t.runId);
      });
    },
    markManual(id: string, ref: string) {
      mutate((s) => {
        const t = s.transfers.find((x) => x.id === id)!;
        t.status = 'manual';
        t.providerRef = ref;
        t.at = Date.now();
        const st = s.settlements.find((x) => x.id === t.settlementId);
        if (st) st.status = 'paid';
        s.ledger.unshift({
          id: nid(s, 'LG'),
          kind: 'manual_transfer',
          direction: 'out',
          amount: t.amount,
          ref,
          settlementId: t.settlementId,
          transferId: t.id,
          at: Date.now(),
          by: opsName(s),
          memo: 'Paid by hand through the provider dashboard',
        });
        sendSms(s, farmer(s, t.farmerId), 'farmer_paid', {
          amount: ghs(t.amount),
          masked: maskMomo(t.momo),
          ref,
          dedupe: t.id,
        });
        s.exceptions
          .filter((e) => e.entity?.id === t.id && e.status !== 'resolved')
          .forEach((e) => {
            e.status = 'resolved';
            e.resolution = `Paid manually, ref ${ref}`;
            e.resolvedAt = Date.now();
          });
        settleRunStatus(s, t.runId);
        audit(s, opsName(s), 'Marked transfer paid manually', t.id, ref);
      });
    },
    fixWallet(farmerId: string, momo: string, network: Farmer['network']) {
      mutate((s) => {
        const f = farmer(s, farmerId)!;
        f.momo = momo;
        f.network = network;
        f.walletBad = false;
        // A new number has to be checked with the provider again before the next payout.
        f.momoVerified = false;
        f.momoName = undefined;
        f.momoVerifiedAt = undefined;
        f.momoVerifyError = undefined;
        f.recipientCode = undefined;
        s.transfers
          .filter((t) => t.farmerId === farmerId && t.status === 'failed')
          .forEach((t) => {
            t.momo = momo;
            t.network = network;
          });
        sendSms(s, f, 'wallet_changed', { masked: maskMomo(momo), dedupe: `${farmerId}:${momo}` });
        audit(s, opsName(s), 'Applied wallet number change', f.name, 'Two approvals recorded');
      });
    },
    resolveException(
      id: string,
      resolution: string,
      status: 'resolved' | 'dismissed' = 'resolved',
    ) {
      mutate((s) => {
        const e = s.exceptions.find((x) => x.id === id)!;
        e.status = status;
        e.resolution = resolution;
        e.resolvedAt = Date.now();
        if (e.type === 'sync_conflict_pay_affecting' && e.entity?.type === 'consignment') {
          const st = s.settlements.find(
            (x) => x.consignmentId === e.entity!.id && x.status === 'held',
          );
          if (st) {
            st.status = 'pending_delivery';
            st.heldReason = undefined;
            const o = order(s, st.orderId);
            if (o?.deliveredAt) {
              st.status = 'payable';
              st.payableAt = o.deliveredAt;
              st.deadlineAt = o.deliveredAt + 24 * H;
            }
          }
        }
        audit(
          s,
          opsName(s),
          `${status === 'resolved' ? 'Resolved' : 'Dismissed'} exception`,
          e.id,
          resolution,
        );
      });
    },
    assignException(id: string) {
      mutate((s) => {
        const e = s.exceptions.find((x) => x.id === id)!;
        e.status = 'in_progress';
        e.assignee = opsName(s);
      });
    },
    updateConfig(patch: Partial<State['config']>, approvals?: string) {
      mutate((s) => {
        const before = JSON.stringify({
          t: s.config.payoutThreshold,
          a: s.config.approverIds,
          c: s.config.checkpoints,
          r: [s.config.tempMin, s.config.tempMax],
        });
        Object.assign(s.config, patch);
        audit(
          s,
          opsName(s),
          'Changed config',
          Object.keys(patch).join(', '),
          `${approvals ? 'Approvals: ' + approvals + '. ' : ''}Before ${before}`,
        );
      });
    },
    // ----- agent (device) -----
    setOnline(deviceId: string, online: boolean) {
      mutate((s) => {
        const d = device(s, deviceId);
        d.online = online;
        if (online) syncDevice(s, deviceId);
      });
    },
    sync(deviceId: string) {
      mutate((s) => syncDevice(s, deviceId));
    },
    registerFarmer(input: {
      name: string;
      phone?: string;
      momo: string;
      network: Farmer['network'];
      tier: Farmer['tier'];
      village: string;
      availability?: { productId: string; expectedKg: number };
    }): string {
      let id = '';
      mutate((s) => {
        const d = device(s, s.session.agentDeviceId);
        id = nid(s, 'F');
        s.farmers.push({
          id,
          code: `FM-0${100 + s.farmers.length + 1}`,
          name: input.name,
          phone: input.phone || undefined,
          momo: input.momo,
          network: input.network,
          tier: input.tier,
          kyc: 'unverified',
          village: input.village,
          consentAt: Date.now(),
          registeredBy: d.userName,
          pendingSync: !d.online,
        });
        if (input.availability)
          s.availability.push({
            id: nid(s, 'AV'),
            farmerId: id,
            productId: input.availability.productId,
            expectedKg: input.availability.expectedKg,
            readyFrom: new Date().toISOString().slice(0, 10),
            readyUntil: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
            source: 'agent',
          });
        deviceEvent(s, d.id, 'farmer.registered', { farmerId: id }, 140);
      });
      return id;
    },
    capture(
      consignmentId: string,
      input: { kg: number; grade: string; pickedAt: string; photos: string[]; notes?: string },
    ) {
      mutate((s) => {
        const d = device(s, s.session.agentDeviceId);
        const c = cons(s, consignmentId)!;
        c.farmGateKg = input.kg;
        c.grade = input.grade;
        c.pickedAt = input.pickedAt;
        c.photos = input.photos;
        c.notes = input.notes;
        c.capturedAt = Date.now();
        c.status = 'captured';
        c.short = isShort(c, s.config.tolerancePct);
        c.pendingSync = !d.online;
        deviceEvent(
          s,
          d.id,
          'consignment.captured',
          { consignmentId },
          60 + input.photos.length * 240,
        );
      });
    },
    coldBox(consignmentId: string) {
      mutate((s) => {
        const d = device(s, s.session.agentDeviceId);
        const c = cons(s, consignmentId)!;
        c.coldBoxAt = Date.now();
        c.status = 'cold_boxed';
        c.pendingSync = !d.online;
        deviceEvent(s, d.id, 'consignment.cold_boxed', { consignmentId }, 2);
      });
    },
    declineSale(consignmentId: string, reason: string) {
      mutate((s) => {
        const d = device(s, s.session.agentDeviceId);
        const c = cons(s, consignmentId)!;
        c.status = 'declined';
        c.declineReason = reason;
        c.pendingSync = !d.online;
        deviceEvent(s, d.id, 'consignment.declined', { consignmentId }, 2);
      });
    },
    adHoc(farmerId: string, orderId: string, lineId: string, plannedKg: number): string {
      let id = '';
      mutate((s) => {
        const o = order(s, orderId)!;
        const line = o.lines.find((l) => l.id === lineId)!;
        id = nid(s, 'CS');
        const run = s.runs.find((r) => r.id === o.runId);
        s.consignments.push({
          id,
          orderId,
          lineId,
          farmerId,
          productId: line.productId,
          productName: line.name,
          plannedKg,
          pricePerKg: s.config.farmGatePrice[line.productId] ?? line.unitPrice / 2,
          photos: [],
          status: 'planned',
          version: o.allocationVersion,
          adHoc: true,
          runId: run?.id,
          stopSeq: run ? run.stops.filter((x) => x.kind === 'farm').length + 1 : undefined,
        });
      });
      return id;
    },
    requestCorrection(consignmentId: string, note: string) {
      mutate((s) => {
        const d = device(s, s.session.agentDeviceId);
        deviceEvent(s, d.id, 'consignment.correction_requested', { consignmentId, note }, 1);
      });
    },
    // ----- driver (device) -----
    stamp(runId: string, seq: number, kind: 'arrived' | 'collected' | 'departed') {
      mutate((s) => {
        const d = device(s, s.session.driverDeviceId);
        const r = s.runs.find((x) => x.id === runId)!;
        const st = r.stops.find((x) => x.seq === seq)!;
        const now = Date.now();
        if (kind === 'arrived') st.arrivedAt = now;
        if (kind === 'collected') st.collectedAt = now;
        if (kind === 'departed') st.departedAt = now;
        if (d.online && r.status === 'planned') r.status = 'in_progress';
        deviceEvent(s, d.id, 'run.stamp', { runId, seq, kind }, 1);
      });
    },
    recordTemp(
      runId: string,
      checkpoint: Checkpoint,
      valueC: number,
      stopSeq?: number,
      note?: string,
    ) {
      mutate((s) => {
        const d = device(s, s.session.driverDeviceId);
        const r = s.runs.find((x) => x.id === runId)!;
        const stop = stopSeq ? r.stops.find((x) => x.seq === stopSeq) : undefined;
        const label =
          checkpoint === 'load'
            ? 'Load · Nsawam node'
            : checkpoint === 'farm_stop'
              ? `Stop ${stopSeq} · ${stop?.label ?? ''}`
              : checkpoint === 'depart_last'
                ? 'Departure · last stop'
                : checkpoint === 'arrival'
                  ? `Arrival · ${stop?.label ?? 'buyer'}`
                  : 'Handover';
        const id = nid(s, 'TP');
        s.temps.push({
          id,
          runId,
          checkpoint,
          stopSeq,
          label,
          valueC,
          source: 'manual',
          photo: true,
          at: Date.now(),
          outOfRange: valueC < r.tempMin || valueC > r.tempMax,
          pendingSync: !d.online,
          note,
        });
        deviceEvent(s, d.id, 'run.temperature_recorded', { readingId: id, runId, valueC }, 180);
      });
    },
    deliver(
      runId: string,
      seq: number,
      lines: {
        orderId: string;
        lineId: string;
        acceptedKg: number;
        rejectedKg: number;
        reason?: string;
      }[],
      receiver: string,
    ) {
      mutate((s) => {
        const d = device(s, s.session.driverDeviceId);
        const r = s.runs.find((x) => x.id === runId)!;
        const st = r.stops.find((x) => x.seq === seq)!;
        const now = Date.now();
        st.arrivedAt = st.arrivedAt ?? now;
        st.deliveredAt = now;
        const orderIds = st.orderIds ?? [st.orderId!];
        const handover = s.temps
          .filter((t) => t.runId === runId && t.checkpoint === 'handover')
          .pop();
        const dId = nid(s, 'DL');
        orderIds.forEach((oid) => {
          const o = order(s, oid)!;
          o.status = 'delivered';
          o.deliveredAt = now;
          o.receiver = receiver;
          o.handoverTemp = handover?.valueC;
          o.lines.forEach((l) => {
            const dl = lines.find((x) => x.lineId === l.id);
            if (dl) {
              l.deliveredKg = round2(dl.acceptedKg + dl.rejectedKg);
              l.rejectedKg = dl.rejectedKg || undefined;
              l.rejectReason = dl.rejectedKg ? dl.reason : undefined;
            }
          });
          s.consignments
            .filter(
              (c) => c.orderId === oid && (c.status === 'in_transit' || c.status === 'cold_boxed'),
            )
            .forEach((c) => {
              c.status = 'delivered';
            });
          s.deliveries.push({
            id: dId + '-' + oid,
            runId,
            orderId: oid,
            at: now,
            receiver,
            signed: true,
            lines: lines.filter((x) => x.orderId === oid),
            pendingSync: !d.online,
          });
        });
        if (r.stops.filter((x) => x.kind === 'delivery').every((x) => x.deliveredAt))
          r.status = 'delivered';
        s.deliveries.push({
          id: dId,
          runId,
          orderId: orderIds[0],
          at: now,
          receiver,
          signed: true,
          lines,
          pendingSync: !d.online,
        });
        deviceEvent(
          s,
          d.id,
          'run.delivered',
          { deliveryId: dId, runId, orderIds: orderIds.join(',') },
          90,
        );
      });
    },
    completeRun(runId: string): string[] {
      const s = get();
      const r = s.runs.find((x) => x.id === runId)!;
      const missing: string[] = [];
      const has = (cp: Checkpoint, seq?: number) =>
        s.temps.some(
          (t) =>
            t.runId === runId && t.checkpoint === cp && (seq === undefined || t.stopSeq === seq),
        );
      if (!has('load')) missing.push('Load reading');
      r.stops
        .filter((x) => x.kind === 'farm' && x.arrivedAt)
        .forEach((x) => {
          if (!has('farm_stop', x.seq)) missing.push(`Stop ${x.seq} · ${x.label} reading`);
        });
      if (!has('depart_last')) missing.push('Departure from last stop reading');
      if (!has('arrival')) missing.push('Arrival reading');
      if (!has('handover')) missing.push('Handover reading');
      if (!r.stops.filter((x) => x.kind === 'delivery').every((x) => x.deliveredAt))
        missing.push('Delivery not confirmed');
      if (missing.length) return missing;
      mutate((st) => {
        const rr = st.runs.find((x) => x.id === runId)!;
        rr.status = 'closed';
        rr.closedReason = 'Completed';
        audit(st, device(st, st.session.driverDeviceId).userName, 'Completed run', runId);
      });
      return [];
    },
    togglePosition(runId: string) {
      mutate((s) => {
        const r = s.runs.find((x) => x.id === runId)!;
        r.positionOn = !r.positionOn;
      });
    },
    setRunPosition(runId: string, position: { lat: number; lng: number; at: number }) {
      mutate((s) => {
        const r = s.runs.find((x) => x.id === runId);
        if (r) r.position = position;
      });
    },
  };
  return A;
}
export type Actions = ReturnType<typeof buildActions>;
type Ctx = {
  state: State;
  act: Actions;
  now: number;
  getState: () => State;
  syncNote: string | null;
};
const StoreCtx = createContext<Ctx | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const ref = useRef<State | null>(state);
  ref.current = state;
  const versionRef = useRef(0);
  const gen = useRef(0);
  const savedGen = useRef(0);
  const pushing = useRef(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const adopt = useCallback((next: State, version: number) => {
    versionRef.current = version;
    savedGen.current = gen.current;
    ref.current = next;
    setState(next);
  }, []);
  const drain = useCallback(async () => {
    const current = ref.current;
    if (!current) return;
    for (const message of current.sms)
      if (message.status === 'queued') {
        const res = await dispatchSms(message.id);
        if (res.error) setSyncNote(res.error);
      }
    for (const transfer of current.transfers) {
      if (transfer.status === 'queued') {
        const res = await dispatchTransfer(transfer.id);
        if (res.error) setSyncNote(res.error);
      } else if (
        transfer.status === 'sent' &&
        transfer.reference &&
        Date.now() - (transfer.at ?? 0) > VERIFY_AFTER
      ) {
        // Paystack normally finishes a transfer through the webhook. If that has not arrived, ask.
        await verifyTransfer(transfer.id);
      }
    }
    for (const order of current.orders) {
      const payment = order.payment;
      if (
        order.status === 'awaiting_payment' &&
        payment &&
        (payment.method === 'card' || payment.method === 'momo') &&
        !payment.checkoutUrl &&
        !payment.checkoutError
      ) {
        const res = await startCheckout(order.id, payment.method, '');
        if (res.link) Linking.openURL(res.link).catch(() => undefined);
        if (res.error) setSyncNote(res.error);
      }
    }
    const fresh = await commit({ op: 'load' });
    if (fresh.state && gen.current === savedGen.current) adopt(fresh.state, fresh.version);
  }, [adopt]);
  const push = useCallback(async () => {
    if (!remoteEnabled || pushing.current || gen.current === savedGen.current) return;
    pushing.current = true;
    const sent = gen.current;
    try {
      const res = await commit({ op: 'save', version: versionRef.current, state: ref.current });
      if (res.error) {
        setSyncNote(res.error);
        return;
      }
      if (res.conflict && res.state) {
        adopt(res.state, res.version);
        setSyncNote('Another change landed first. This screen is showing the saved record.');
        return;
      }
      versionRef.current = res.version;
      if (sent === gen.current) savedGen.current = sent;
      if (res.state && sent === gen.current) {
        ref.current = res.state;
        setState(res.state);
      }
      setSyncNote(null);
      await drain();
    } finally {
      pushing.current = false;
      if (gen.current !== savedGen.current) void push();
    }
  }, [adopt, drain]);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!remoteEnabled) {
        const s = await load();
        if (!live) return;
        ref.current = s;
        setState(s);
        return;
      }
      const res = await commit({ op: 'load' });
      if (!live) return;
      if (res.error) {
        setSyncNote(res.error);
        return;
      }
      if (res.empty) {
        const opened = await commit({
          op: 'bootstrap',
          state: stateForNewNode(res.profile?.display_name || 'Node manager'),
        });
        if (!live) return;
        if (opened.error || !opened.state) {
          setSyncNote(opened.error ?? 'Could not open the operating record.');
          return;
        }
        adopt(opened.state, opened.version);
        return;
      }
      if (res.state) adopt(res.state, res.version);
    })();
    return () => {
      live = false;
    };
  }, [adopt]);
  useEffect(() => {
    if (!remoteEnabled && state) save(state);
  }, [state]);
  useEffect(() => {
    if (!remoteEnabled || !state || gen.current === savedGen.current) return;
    const timer = setTimeout(() => {
      void push();
    }, 600);
    return () => clearTimeout(timer);
  }, [state, push]);
  useEffect(() => {
    if (!remoteEnabled) return;
    const timer = setInterval(() => {
      if (pushing.current || gen.current !== savedGen.current) return;
      void commit({ op: 'load' }).then((res) => {
        if (!res.state || res.version === versionRef.current || gen.current !== savedGen.current)
          return;
        adopt(res.state, res.version);
      });
    }, 8000);
    return () => clearInterval(timer);
  }, [adopt]);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(i);
  }, []);
  const mutate = useCallback((fn: (s: State) => void) => {
    const next = clone(ref.current as State);
    fn(next);
    gen.current += 1;
    ref.current = next;
    setState(next);
    setNow(Date.now());
  }, []);
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const trackedRun = state?.runs.find((run) => run.positionOn && run.status === 'in_progress')?.id;
  const driverDevice = state?.session.driverDeviceId;
  useEffect(() => {
    if (!remoteEnabled || !trackedRun || !driverDevice) return;
    const device = ref.current?.devices.find((item) => item.id === driverDevice);
    if (device?.role !== 'driver') return;
    const minutes = Math.max(1, ref.current?.config.pingMinutes ?? 5);
    const tick = () => {
      void readPosition().then((position) => {
        if (position)
          mutateRef.current((s) => {
            const run = s.runs.find((item) => item.id === trackedRun);
            if (run?.positionOn) run.position = position;
          });
      });
    };
    tick();
    const timer = setInterval(tick, minutes * 60000);
    return () => clearInterval(timer);
  }, [trackedRun, driverDevice]);
  useEffect(() => {
    if (!state?.orders.some((order) => !isIsoDay(order.deliveryDate))) return;
    mutate((s) => {
      for (const order of s.orders) {
        if (isIsoDay(order.deliveryDate)) continue;
        const lead = Number.isFinite(s.config.leadDays) ? s.config.leadDays : 0;
        const day = addDays(isoDay(order.submittedAt || Date.now()), lead);
        order.deliveryDate = isIsoDay(day) ? day : isoDay(Date.now());
      }
    });
  }, [state, mutate]);
  const act = useMemo(() => buildActions(() => ref.current as State, mutate), [mutate]);
  const getState = useCallback(() => ref.current as State, []);
  if (!state)
    return (
      <View style={{ flex: 1, backgroundColor: '#FBFAF6', padding: 24, justifyContent: 'center' }}>
        <Text style={{ fontSize: 16, color: '#1A2330' }}>
          {syncNote ?? 'Loading the operating record…'}
        </Text>
      </View>
    );
  return (
    <StoreCtx.Provider value={{ state, act, now, getState, syncNote }}>
      {children}
    </StoreCtx.Provider>
  );
}
export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('StoreProvider missing');
  return c;
}
export type { OrderLine };
