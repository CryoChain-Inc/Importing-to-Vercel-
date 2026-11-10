/** The only units a product can be stocked, listed, ordered and paid in. Pack sizes (crate, bag) are not units. */
export const UNITS = ['kg', 'liter', 'piece', 'bunch'] as const;

/** Quick-add amounts on the farmer quantity step, sized to what a farmer typically holds in each unit. */
export const QUICK_ADD: Record<string, number[]> = {
  kg: [50, 100, 500],
  liter: [10, 50, 100],
  piece: [30, 100, 500],
  bunch: [5, 10, 50],
};
