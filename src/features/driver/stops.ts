import type {
  DeliveryOrder,
  DropoffStop,
  HandoverMediaKind,
  PickupStop,
} from '../../services/driver.deliveries.service';

/** One thing to hand over at a stop: a produce line to collect, or an order to deliver. */
export interface StopLine {
  stopId: string;
  orderId: string;
  orderCode: string;
  /** Produce name for a pickup; the order code for a drop-off. */
  label: string;
  qty: number | null;
  unit: string;
  state: 'pending' | 'done';
  recordedKg: number | null;
  pickup: PickupStop | null;
  dropoff: DropoffStop | null;
  /** What this line covers: the one produce for a pickup, every produce of the order for a drop-off. */
  items: { product: string; qty: number; unit: string }[];
  /** Drop-off only: some produce of this order is still at the farm. */
  blocked: boolean;
}

/** One place the driver stops at. Lines for the same farmer, or the same buyer and address, share it. */
export interface Stop {
  key: string;
  kind: 'pickup' | 'dropoff';
  name: string;
  phone: string;
  place: string;
  lat: number;
  lng: number;
  eta: string | null;
  seq: number | null;
  state: 'pending' | 'done';
  lines: StopLine[];
  /** Drop-off only: orders at this stop still waiting on a farm pickup. */
  waiting: number;
  temperatureC: number | null;
  note: string;
  mediaUrl: string | null;
  mediaKind: HandoverMediaKind | null;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const minSeq = (xs: (number | null)[]) => {
  const n = xs.filter((x): x is number => x != null);
  return n.length ? Math.min(...n) : null;
};

/** Sums quantities per unit, since kilos and crates do not add up. */
export function totalText(lines: { qty: number | null; unit: string }[]): string {
  const m = new Map<string, number>();
  for (const l of lines) if (l.qty != null) m.set(l.unit, (m.get(l.unit) ?? 0) + l.qty);
  return [...m].map(([u, n]) => `${Math.round(n * 10) / 10} ${u}`).join(' + ');
}

/**
 * Groups every order's pickups and drop-offs into stops. Pending stops come first in driving order, done stops after.
 * `ongoing` orders are the live route; the rest are history.
 */
export function buildStops(orders: DeliveryOrder[]): { todo: Stop[]; done: Stop[] } {
  const groups = new Map<string, Stop>();
  const add = (key: string, make: () => Stop, line: StopLine, seq: number | null) => {
    const g = groups.get(key) ?? make();
    g.lines.push(line);
    g.seq = minSeq([g.seq, seq]);
    groups.set(key, g);
  };

  for (const o of orders) {
    const live = o.ongoing ? 'live' : 'past';
    for (const p of o.pickups) {
      add(
        `pickup:${p.farmerId ?? p.stopId}:${live}`,
        () => ({
          key: `pickup:${p.farmerId ?? p.stopId}:${live}`,
          kind: 'pickup',
          name: p.farmerName,
          phone: p.farmerPhone,
          place: p.place,
          lat: p.lat,
          lng: p.lng,
          eta: p.eta,
          seq: null,
          state: 'done',
          lines: [],
          waiting: 0,
          temperatureC: p.temperatureC,
          note: p.note,
          mediaUrl: p.mediaUrl,
          mediaKind: p.mediaKind,
        }),
        {
          stopId: p.stopId,
          orderId: o.id,
          orderCode: o.code,
          label: p.product,
          qty: p.expectedKg,
          unit: p.expectedUnit,
          state: p.state,
          recordedKg: p.recordedKg,
          pickup: p,
          dropoff: null,
          items: [{ product: p.product, qty: p.expectedKg, unit: p.expectedUnit }],
          blocked: false,
        },
        p.seq,
      );
    }
    const d = o.dropoff;
    if (d) {
      const key = `dropoff:${norm(o.buyerPhone || o.buyerName)}|${norm(o.address)}:${live}`;
      add(
        key,
        () => ({
          key,
          kind: 'dropoff',
          name: o.buyerName,
          phone: o.buyerPhone,
          place: o.address,
          lat: d.lat,
          lng: d.lng,
          eta: d.eta,
          seq: null,
          state: 'done',
          lines: [],
          waiting: 0,
          temperatureC: d.temperatureC,
          note: d.note,
          mediaUrl: d.mediaUrl,
          mediaKind: d.mediaKind,
        }),
        {
          stopId: d.stopId,
          orderId: o.id,
          orderCode: o.code,
          label: o.code,
          qty: null,
          unit: '',
          state: d.state,
          recordedKg: null,
          pickup: null,
          dropoff: d,
          items: o.pickups.map((p) => ({
            product: p.product,
            qty: p.recordedKg ?? p.expectedKg,
            unit: p.expectedUnit,
          })),
          blocked: o.pickups.some((p) => p.state === 'pending'),
        },
        d.seq,
      );
    }
  }

  const all = [...groups.values()].map((g) => {
    const pending = g.lines.some((l) => l.state === 'pending');
    const waiting =
      g.kind === 'dropoff'
        ? new Set(
            g.lines
              .filter((l) =>
                orders.find((o) => o.id === l.orderId)?.pickups.some((p) => p.state === 'pending'),
              )
              .map((l) => l.orderId),
          ).size
        : 0;
    return { ...g, state: pending ? ('pending' as const) : ('done' as const), waiting };
  });
  const bySeq = (a: Stop, b: Stop) => (a.seq ?? 999) - (b.seq ?? 999);
  return {
    todo: all.filter((s) => s.state === 'pending' && s.key.endsWith(':live')).sort(bySeq),
    done: all.filter((s) => s.state === 'done').sort(bySeq),
  };
}

/** The stop to go to after `key`, or null when it was the last one. */
export const stopAfter = (todo: Stop[], key: string): Stop | null =>
  todo.find((s) => s.key !== key) ?? null;
