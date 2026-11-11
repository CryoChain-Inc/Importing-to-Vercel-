# Spec: farmer-pickups

Module `farmer-pickups` from `CAPABILITY-MAP.md`. Branch: `fea/farmer-pickups` (off `fea/refunds`).

## Objective

A farmer has one place that shows when the truck is coming and, afterwards, what was expected, collected and paid,
instead of reading it out of the Messages list.

## Behaviour

- New **Pickups** tab (between Listings and Messages). The old "Scheduled pickups" card in Messages is removed.
- **Coming up:** one card per pickup line (one product from this farm for one order): quantity reserved, "Reserved"
  until a truck is dispatched, then "Truck on the way" with the estimated arrival, and what it earns.
- **History:** expected, collected, short, earned or paid, and when it was collected; plus the share of reserved
  quantity collected across all pickups.
- The buyer is never shown. A farmer sees only their own lines.

## Structure

- Migration `20261115090000_farmer_pickups.sql`: `farmer_pickups()` (farmers cannot read delivery stops, so arrival
  times come through it), and the short part of a line now stays linked to its pickup (`collect_line`,
  `report_listing_shortage` redefined; existing rows backfilled).
- `fetchPickups` in `farmer.service.ts`, `PickupsPanel.tsx`, `FarmerHome.tsx`.

## Testing

pgTAP `farmer_pickups.test.sql` (on the way with arrival time, 80 of 100 shows as one line with 20 short, waiting
state, no buyer data, other farmers see nothing); Jest mapping test.
