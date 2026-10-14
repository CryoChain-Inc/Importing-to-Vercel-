import type { CropPrice } from '../types/auth';

// Public farmer prices. Illustrative demo values, not published prices.
export const DEMO_PRICES: CropPrice[] = [
  { id: 'p1', crop: 'Tomato', grade: 'A', unit: 'kg', price: 8.5, changePct: 2.4, window: 'Mon–Wed collection' },
  { id: 'p2', crop: 'Tomato', grade: 'B', unit: 'kg', price: 6.8, changePct: -1.1, window: 'Mon–Wed collection' },
  { id: 'p3', crop: 'Pepper', grade: 'A', unit: 'kg', price: 14, changePct: 5.2, window: 'Tue–Thu collection' },
  { id: 'p4', crop: 'Okra', grade: 'A', unit: 'kg', price: 7.2, changePct: 0, window: 'Tue–Thu collection' },
  { id: 'p5', crop: 'Cabbage', grade: 'B', unit: 'kg', price: 4.1, changePct: -3.6, window: 'Wed collection' },
  { id: 'p6', crop: 'Onion', grade: 'A', unit: 'kg', price: 9.9, changePct: 1.7, window: 'Thu–Fri collection' },
];

export const PRICES_EFFECTIVE = 'Updated today, 06:00';
