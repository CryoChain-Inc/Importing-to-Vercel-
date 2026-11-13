import type { ProduceListing } from '../../../services/farmer.service';
import { fmtQty } from '../../../utils/format';

/** Quantities only add up within one unit, so a product sold in several units shows one figure per unit. */
export function qtyByUnit(ls: ProduceListing[], f: (l: ProduceListing) => number): string {
  const m = new Map<string, number>();
  for (const l of ls) m.set(l.unit, (m.get(l.unit) ?? 0) + f(l));
  return [...m].map(([u, n]) => fmtQty(n, u)).join(' + ');
}

/** Fraction of what was listed that is sold, averaged over listings so mixed units still read right. */
export function soldShare(ls: ProduceListing[]): number {
  if (ls.length === 0) return 0;
  return ls.reduce((a, l) => a + (l.weightKg > 0 ? l.soldKg / l.weightKg : 0), 0) / ls.length;
}

export const inStock = (l: ProduceListing) => l.remainingKg > 0;
