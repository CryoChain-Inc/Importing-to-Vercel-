import { cartReducer } from './cart';

const line = { productId: 'p1', unit: 'kg', kg: 10 };

describe('cartReducer', () => {
  it('replaces the quantity of the same product and unit', () => {
    const next = cartReducer([line], { type: 'set', line: { ...line, kg: 25 } });
    expect(next).toEqual([{ ...line, kg: 25 }]);
  });
  it('keeps units as separate lines', () => {
    const next = cartReducer([line], { type: 'set', line: { ...line, unit: 'crate' } });
    expect(next).toHaveLength(2);
  });
  it('removes a line when the quantity drops to zero', () => {
    expect(cartReducer([line], { type: 'set', line: { ...line, kg: 0 } })).toEqual([]);
  });
  it('caps absurd quantities', () => {
    expect(cartReducer([], { type: 'set', line: { ...line, kg: 1e9 } })[0].kg).toBe(30000);
  });
});
