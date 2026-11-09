import type { CartLine } from '../../../services/buyer.service';

/** Quantity step on the cart stepper: 5 for kg, 1 for countable units (crate, bunch, egg...). */
export const stepFor = (unit: string) => (unit === 'kg' ? 5 : 1);
export const KG_MAX = 30000;

export type CartAction =
  | { type: 'load'; lines: CartLine[] }
  | { type: 'set'; line: CartLine }
  | { type: 'remove'; productId: string; unit: string }
  | { type: 'clear' };

const same = (a: { productId: string; unit: string }, b: { productId: string; unit: string }) =>
  a.productId === b.productId && a.unit === b.unit;

/** One line per product+unit. Setting kg to zero or less removes the line. */
export function cartReducer(lines: CartLine[], a: CartAction): CartLine[] {
  switch (a.type) {
    case 'load':
      return a.lines;
    case 'clear':
      return [];
    case 'remove':
      return lines.filter((l) => !same(l, { productId: a.productId, unit: a.unit }));
    case 'set': {
      const rest = lines.filter((l) => !same(l, a.line));
      const kg = Math.min(KG_MAX, Math.round(a.line.kg * 100) / 100);
      return kg > 0 ? [...rest, { ...a.line, kg }] : rest;
    }
  }
}
