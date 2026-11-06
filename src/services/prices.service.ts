import type { CropPrice } from '../types/auth';
import { imageUrl } from './catalogueImage';
import { supabase } from './supabase';

export interface PriceBoardData {
  prices: CropPrice[];
  updatedAt: string | null;
}

/** Farm-gate prices per product unit (buyer prices are never part of this). Open to signed-out visitors. */
export async function fetchPrices(): Promise<PriceBoardData> {
  const { data, error } = await supabase.rpc('price_board');
  if (error) throw new Error('Could not load prices.');
  const rows = data ?? [];
  const prices: CropPrice[] = rows.map((r: any): CropPrice => ({
    id: `${r.product_id}-${r.unit}`,
    crop: r.product_name,
    unit: r.unit,
    price: Number(r.price),
    changePct: r.prev_price ? ((Number(r.price) - Number(r.prev_price)) / Number(r.prev_price)) * 100 : 0,
    category: r.category_name ?? '',
    imageUrl: imageUrl(r.image_path),
  }));
  prices.sort((a, b) => a.crop.localeCompare(b.crop));
  const updatedAt = rows.reduce((m: string | null, r: any) => (!m || r.updated_at > m ? r.updated_at : m), null);
  return { prices, updatedAt };
}
