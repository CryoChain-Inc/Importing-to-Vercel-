import type { AllocationStatus, BoardOrder, BoardStop } from '../../services/ops.fulfilment.service';

const ACTIVE: AllocationStatus[] = ['offered', 'accepted', 'collected'];

export type TrackKey = 'placed' | 'paid' | 'farmers' | 'collecting' | 'to_buyer' | 'delivered';

export interface TrackStep { key: TrackKey; label: string }

export const TRACK_STEPS: TrackStep[] = [
  { key: 'placed', label: 'Ordered' },
  { key: 'paid', label: 'Paid' },
  { key: 'farmers', label: 'Farmers' },
  { key: 'collecting', label: 'Collecting' },
  { key: 'to_buyer', label: 'To buyer' },
  { key: 'delivered', label: 'Delivered' },
];

export interface OrderTrack {
  key: TrackKey;
  index: number;
  cancelled: boolean;
  orderedKg: number;
  allocatedKg: number;
  collectedKg: number;
  next: BoardStop | null;
}

/** Where an order sits from checkout to the buyer's door, and how many kilos have moved. */
export function orderTrack(o: BoardOrder): OrderTrack {
  const cancelled = o.state === 'cancelled';
  const live = o.allocations.filter((a) => ACTIVE.includes(a.status));
  const allocatedKg = live.reduce((n, a) => n + a.kg, 0);
  const collectedKg = o.allocations.reduce((n, a) => n + (a.takenKg ?? (a.status === 'collected' ? a.kg : 0)), 0);
  const dropDone = o.stops.some((s) => s.kind === 'dropoff' && s.state === 'done');
  const pickups = o.stops.filter((s) => s.kind === 'pickup');
  const pickupsDone = pickups.filter((s) => s.state === 'done').length;
  const next = cancelled ? null : [...o.stops].filter((s) => s.state === 'pending').sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999))[0] ?? null;

  let key: TrackKey = 'placed';
  if (dropDone) key = 'delivered';
  else if (o.state === 'awaiting_payment') key = 'placed';
  else if (pickups.length > 0 && pickupsDone === pickups.length) key = 'to_buyer';
  else if (pickupsDone > 0 || live.some((a) => a.status === 'collected')) key = 'collecting';
  else if (live.length > 0) key = live.every((a) => a.status === 'offered') ? 'farmers' : 'collecting';
  else if (o.state === 'paid') key = 'paid';

  return {
    key,
    index: TRACK_STEPS.findIndex((s) => s.key === key),
    cancelled,
    orderedKg: o.itemKg,
    allocatedKg,
    collectedKg,
    next,
  };
}

export type BoardFilter = 'attention' | 'farmers' | 'moving' | 'done' | 'closed';

/** Filter used on the orders board and the dashboard "on the road" list. */
export function boardFilter(o: BoardOrder): { stage: BoardFilter; label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
  if (o.state === 'cancelled') return { stage: 'closed', label: 'Cancelled', tone: 'neutral' };
  if (o.state === 'awaiting_payment') return { stage: 'closed', label: 'Awaiting payment', tone: 'warning' };
  const track = orderTrack(o);
  if (track.key === 'delivered') return { stage: 'done', label: 'Delivered', tone: 'success' };
  if (track.key === 'to_buyer') return { stage: 'moving', label: 'To the buyer', tone: 'info' };
  if (track.key === 'collecting') return { stage: 'moving', label: 'Being collected', tone: 'info' };
  if (track.key === 'farmers') return { stage: 'farmers', label: 'Waiting for farmers', tone: 'warning' };
  return { stage: 'attention', label: 'Not allocated', tone: 'danger' };
}
