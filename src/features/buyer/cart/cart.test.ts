import { cartReducer } from './cart';

const line = { productId: 'p1', grade: 'A' as const, kg: 10 };

describe('cartReducer', () => {
  it('replaces the kg of the same product and grade', () => {
    const next = cartReducer([line], { type: 'set', line: { ...line, kg: 25 } });
    expect(next).toEqual([{ ...line, kg: 25 }]);
  });
  it('keeps grades as separate lines', () => {
    const next = cartReducer([line], { type: 'set', line: { ...line, grade: 'B' } });
    expect(next).toHaveLength(2);
  });
  it('removes a line when kg drops to zero', () => {
    expect(cartReducer([line], { type: 'set', line: { ...line, kg: 0 } })).toEqual([]);
  });
  it('caps absurd quantities', () => {
    expect(cartReducer([], { type: 'set', line: { ...line, kg: 1e9 } })[0].kg).toBe(30000);
  });
});
