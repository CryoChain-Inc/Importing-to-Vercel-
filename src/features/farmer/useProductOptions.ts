import { useEffect, useState } from 'react';
import { fetchPricedGrades, fetchProductNames } from '../../services/farmer.service';

/** Active product names and the grades that have a published price. Loads once `enabled` turns true. */
export function useProductOptions(enabled: boolean) {
  const [products, setProducts] = useState<string[]>([]);
  const [priced, setPriced] = useState<Record<string, string[]> | null>(null);
  const [pricesFailed, setPricesFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || products.length) return;
    fetchProductNames().then(setProducts, (e) => setError(e.message));
    fetchPricedGrades().then(setPriced, () => setPricesFailed(true));
  }, [enabled, products.length]);

  return { products, priced, pricesFailed, error };
}
