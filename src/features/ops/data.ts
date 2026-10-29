import type * as buyers from '../../services/ops.buyers.service';
import type * as fulfil from '../../services/ops.fulfilment.service';
import type * as payouts from '../../services/ops.payouts.service';
import type * as ops from '../../services/ops.service';

/** Everything the ops sections read, loaded together so tabs never fetch on switch. */
export interface OpsData {
  farmers: ops.FarmerRow[];
  buyers: ops.BuyerRow[];
  supply: ops.SupplyRow[];
  orders: buyers.OrderRow[];
  board: fulfil.BoardOrder[];
  drivers: fulfil.DriverRoute[];
  decisions: fulfil.Decision[];
  categories: ops.Category[];
  team: ops.TeamMember[];
  config: ops.OpsConfig;
  payables: payouts.PayableRow[];
  runs: payouts.PayoutRun[];
}

/** Kilos listed by farmers and kilos still unsold, per product, largest first. */
export function supplyByProduct(supply: ops.SupplyRow[]) {
  const totals = new Map<string, { kg: number; left: number }>();
  supply.forEach((r) => {
    const t = totals.get(r.product) ?? { kg: 0, left: 0 };
    totals.set(r.product, { kg: t.kg + r.weightKg, left: t.left + r.remainingKg });
  });
  return [...totals].map(([product, t]) => ({ product, ...t })).sort((a, b) => b.kg - a.kg);
}
