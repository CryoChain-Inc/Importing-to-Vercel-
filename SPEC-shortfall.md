# Spec: shortfall

Module `shortfall` from `CAPABILITY-MAP.md`. Branch: `fea/shortfall` (off `fea/dispatch`). Status: approved 2026-11-13.

## Objective

When a farm has less than was reserved, the system pays the farmer for what was actually collected, finds the rest
from the nearest farm without waiting for a person, and hands whatever cannot be found to ops as a shortage to refund.

## How it works today

The driver records the collected quantity, but nothing uses it. The allocation is marked collected at the reserved
quantity and the farmer is paid for the reserved quantity (`create_payout_run` sums `order_allocations.amount`).

## Behaviour

### 1. At pickup
The driver records the quantity collected for a line (zero is allowed: "nothing to collect").

- The recorded quantity is spread over the line's allocations, oldest listing first. Each allocation's quantity and
  payout become what was collected; the reserved quantity is kept alongside for the record. An allocation that
  received nothing is cancelled.
- Quantity above what was reserved cannot be recorded.
- The missing quantity is taken off the farmer's listing, so it is not offered to another buyer.

### 2. Tolerance
If the missing quantity is within the tolerance (`ops_config.pickup_tolerance_pct`, default 2 %) of what the line
expected, nothing else happens: no top-up, no refund, no ops item. It is recorded on the order as tolerated.

### 3. Automatic top-up
Beyond tolerance, the missing quantity is allocated straight away from other farms with stock, using the normal
allocation order (nearest first), limited to farms within `detour_km` (25) of the truck's remaining route. The new
pickup joins the same truck's route and the farmers involved get the usual reserved and truck-on-the-way messages.

### 4. No stock
Whatever cannot be topped up is recorded on the order as short. The buyer gets an in-app notice stating the product
and quantity that will not arrive and that a refund will follow. Ops get a decision-register item ("Short supply").
The delivery of the rest continues. Creating and paying the refund is the `refunds` module.

### 5. Farmer reports a shortage before pickup
From the edit screen, a farmer who cannot supply what is reserved enters what they really have. The newest
reservations on that listing are reduced first, and steps 2 to 4 run for the affected orders. The farmer is not
paid for what they did not supply.

## Decisions (approved 2026-11-13)

1. **The driver cannot over-collect.** Recording more than was reserved on a line is refused.
2. **A shortage corrects the listing.** The missing quantity is kept as a withdrawn ('declined') allocation, and any
   unsold remainder on that listing is removed, so stock shown to buyers stays true.
3. **Top-up is immediate and automatic**, from farms within the detour limit, never from the farm that came up short.
4. **Zero can be recorded** when the farm had nothing.
5. Tolerance is measured per pickup line and is not refunded.

## Not in this module

- Refund request, approval and Paystack refund (`refunds`).
- Quality rejections and disputes; payout holds.
- A settings screen for the tolerance (`ops-control`); the value exists in `ops_config`.
- Farmer pickup history screen (`farmer-pickups`).

## Data changes

- No new allocation column: a short allocation is split into a collected row and a 'declined' row for the gap.
- `order_items.tolerated_kg`, `order_items.short_kg`: quantity that will not be delivered, without and with a refund.
- `ops_config.pickup_tolerance_pct` (default 2).
- `ops_decisions.kind` gains `short_supply`.
- `delivery_handovers` allows a recorded quantity of zero.
- Changed: `complete_delivery_stop`, `record_delivery_handover` (zero allowed), `allocate_order` (subtracts tolerated
  and short quantities; detour limit when the order is already on a truck).
- New: `private.settle_shortfall(order, product)`, `public.report_listing_shortage(listing, available)`.

Payout code is not changed: it already pays `order_allocations.amount`, which now reflects what was collected.

## Commands

```
Typecheck:  npx tsc --noEmit
Lint:       npx expo lint
Unit tests: npx jest src
DB tests:   npx supabase test db
```

## Project Structure

```
supabase/migrations/   one migration
supabase/tests/        shortfall.test.sql
src/services/farmer.service.ts, driver.deliveries.service.ts
src/features/farmer/components/EditListing.tsx     report a shortage
src/features/driver/components/DeliveryPages.tsx   allow zero, show what was expected
```

## Testing Strategy

- **pgTAP**: 100 reserved, 80 collected over two listings splits 50 + 30 and pays for 80; 99 collected is tolerated;
  80 collected with a nearby farm creates a 20 top-up on the same truck; with no nearby farm records 20 short, a buyer
  notice and a decision; recording 110 is refused; zero collected cancels the allocations; farmer-reported shortage
  reduces the newest reservation and tops up.
- **Jest**: service error mapping.
- **Manual**: driver records a short pickup on Android; farmer reports a shortage.

## Boundaries

- Always: every money rule in the database; delivered orders stay frozen; typecheck, lint and tests before done.
- Ask first: any change to payout or payment functions.
- Never: commit; delete allocation or handover history; pay more than was reserved.

## Success Criteria

- [ ] Driver collects 80 of 100: the farmer's payable amount is for 80 and their listing drops by 20.
- [ ] 99 of 100: paid for 99, no top-up, no ops item, no buyer notice.
- [ ] 80 of 100 with stock 5 km away: a 20 pickup appears on the same driver's route without anyone acting.
- [ ] 80 of 100 with no stock nearby: the buyer is notified of 20 short and ops see "Short supply".
- [ ] A farmer reporting 60 available on a listing with 100 reserved triggers the same handling for 40.
- [ ] Typecheck and lint show no new errors; jest and pgTAP pass.
