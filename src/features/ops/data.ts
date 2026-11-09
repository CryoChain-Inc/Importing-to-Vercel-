import type * as buyers from '../../services/ops.buyers.service';
import type * as fulfil from '../../services/ops.fulfilment.service';
import type * as payouts from '../../services/ops.payouts.service';
import type * as ops from '../../services/ops.service';

/** What the dashboard reads; loaded first so it can paint before the rest. */
export interface OpsCore {
  supply: ops.SupplyRow[];
  orders: buyers.OrderRow[];
  board: fulfil.BoardOrder[];
}

/** Everything else the ops sections read. */
export interface OpsRest {
  farmers: ops.FarmerRow[];
  buyers: ops.BuyerRow[];
  drivers: fulfil.DriverRoute[];
  decisions: fulfil.Decision[];
  categories: ops.Category[];
  team: ops.TeamMember[];
  config: ops.OpsConfig;
  payables: payouts.PayableRow[];
  runs: payouts.PayoutRun[];
}

/** Everything the ops sections read, loaded together so tabs never fetch on switch. */
export type OpsData = OpsCore & OpsRest;

/** Quantity listed by farmers and still unsold, per product and unit (units don't add up), largest first. */
export function supplyByProduct(supply: ops.SupplyRow[]) {
  const totals = new Map<string, { product: string; unit: string; kg: number; left: number }>();
  supply.forEach((r) => {
    const key = `${r.product}|${r.unit}`;
    const t = totals.get(key) ?? { product: r.product, unit: r.unit, kg: 0, left: 0 };
    totals.set(key, { ...t, kg: t.kg + r.weightKg, left: t.left + r.remainingKg });
  });
  return [...totals.values()].sort((a, b) => b.kg - a.kg);
}
