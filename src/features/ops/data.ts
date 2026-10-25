import type * as buyers from '../../services/ops.buyers.service';
import type * as ops from '../../services/ops.service';

/** Everything the ops sections read, loaded together so tabs never fetch on switch. */
export interface OpsData {
  farmers: ops.FarmerRow[];
  buyers: ops.BuyerRow[];
  supply: ops.SupplyRow[];
  orders: buyers.OrderRow[];
  categories: ops.Category[];
  products: ops.Product[];
  prices: ops.PriceRow[];
  team: ops.TeamMember[];
  config: ops.OpsConfig;
}

/** Kilos listed by farmers, per product, largest first. */
export function supplyByProduct(supply: ops.SupplyRow[]) {
  const totals = new Map<string, number>();
  supply.forEach((r) => totals.set(r.product, (totals.get(r.product) ?? 0) + r.weightKg));
  return [...totals].map(([product, kg]) => ({ product, kg })).sort((a, b) => b.kg - a.kg);
}
