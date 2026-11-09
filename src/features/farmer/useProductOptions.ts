import { useEffect, useState } from 'react';
import { fetchProductOptions, type ProductOption } from '../../services/farmer.service';

/** Active, priced products with their unit. Loads once `enabled` turns true. */
export function useProductOptions(enabled: boolean) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || products.length) return;
    fetchProductOptions().then(setProducts, (e) => setError(e.message));
  }, [enabled, products.length]);

  return { products, error };
}
