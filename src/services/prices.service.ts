import type { CropPrice } from '../types/auth';
import { supabase } from './supabase';

export interface PriceBoardData {
  prices: CropPrice[];
  updatedAt: string | null;
}

/** Public farmer prices. The database only returns Grade A to signed-out visitors. */
export async function fetchPrices(gradeAOnly = false): Promise<PriceBoardData> {
  let q = supabase
    .from('crop_prices')
    .select('product_id, grade, unit, price, prev_price, window_label, updated_at, products!inner(name)')
    .eq('products.active', true)
    .order('updated_at', { ascending: false });
  if (gradeAOnly) q = q.eq('grade', 'A');
  const { data, error } = await q;
  if (error) throw new Error('Could not load prices.');
  const rows = data ?? [];
  const prices = rows.map((r: any): CropPrice => ({
    id: `${r.product_id}-${r.grade}`,
    crop: r.products.name,
    grade: r.grade,
    unit: r.unit,
    price: Number(r.price),
    changePct: r.prev_price ? ((Number(r.price) - Number(r.prev_price)) / Number(r.prev_price)) * 100 : 0,
    window: r.window_label ?? '',
  }));
  prices.sort((a, b) => a.crop.localeCompare(b.crop) || a.grade.localeCompare(b.grade));
  return { prices, updatedAt: rows[0]?.updated_at ?? null };
}
