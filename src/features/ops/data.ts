import type * as buyers from '../../services/ops.buyers.service';
import type * as ops from '../../services/ops.service';
import type * as payouts from '../../services/ops.payouts.service';

/** Everything the ops sections read, loaded together so tabs never fetch on switch. */
export interface OpsData {
  farmers: ops.FarmerRow[];
  buyers: ops.BuyerRow[];
  supply: ops.SupplyRow[];
  lots: ops.LotRow[];
  orders: buyers.OrderRow[];
  requirements: buyers.RequirementRow[];
  categories: ops.Category[];
  products: ops.Product[];
  prices: ops.PriceRow[];
  points: ops.PointRow[];
  team: ops.TeamMember[];
  config: ops.OpsConfig;
  settlements: payouts.SettlementRow[];
  runs: payouts.PayoutRun[];
}

/** Supply split: not yet in a lot, in an unpaid lot, or sold (paid). `left` is what can still be sold. */
export function supplySplit(supply: ops.SupplyRow[], isSold: (r: ops.SupplyRow) => boolean) {
  let available = 0, reserved = 0, sold = 0;
  for (const r of supply) {
    if (!r.lotId) available += r.weightKg;
    else if (isSold(r)) sold += r.weightKg;
    else reserved += r.weightKg;
  }
  return { available, reserved, sold, left: available + reserved, total: available + reserved + sold };
}
