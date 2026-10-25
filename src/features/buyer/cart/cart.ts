import type { CartLine } from '../../../services/buyer.service';

export const KG_STEP = 5;
export const KG_MAX = 30000;

export type CartAction =
  | { type: 'load'; lines: CartLine[] }
  | { type: 'set'; line: CartLine }
  | { type: 'remove'; productId: string; grade: string }
  | { type: 'clear' };

const same = (a: { productId: string; grade: string }, b: { productId: string; grade: string }) =>
  a.productId === b.productId && a.grade === b.grade;

/** One line per product+grade. Setting kg to zero or less removes the line. */
export function cartReducer(lines: CartLine[], a: CartAction): CartLine[] {
  switch (a.type) {
    case 'load':
      return a.lines;
    case 'clear':
      return [];
    case 'remove':
      return lines.filter((l) => !same(l, { productId: a.productId, grade: a.grade }));
    case 'set': {
      const rest = lines.filter((l) => !same(l, a.line));
      const kg = Math.min(KG_MAX, Math.round(a.line.kg * 100) / 100);
      return kg > 0 ? [...rest, { ...a.line, kg }] : rest;
    }
  }
}
