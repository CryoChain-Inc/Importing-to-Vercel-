# Spec: ops-control

Module `ops-control` from `CAPABILITY-MAP.md`. Branch: `fea/ops-control` (off `fea/live-tracking`).
Status: approved 2026-11-17.

## Objective

Ops can see every exception the system raises and fix any of them from the dashboard, without a developer, while
every manual change is recorded with who did it and why.

## What ops can do today

- Settings: temperature range, buyer markup, farmer discount, support contact.
- Decision register: read and resolve with a note; "Re-run allocation" on an order; "Re-plan all routes".
- Refunds (new), Fleet (new). Nothing else on live orders can be changed by hand.

## Behaviour

### 1. Logistics settings
A "Logistics" section on the Settings page for every value added in this project, each with its allowed range:

| Setting | Default | Range |
|---|---|---|
| Wait for the truck to fill (minutes) | 120 | 0 to 1440 |
| Dispatch hours | 06:00 to 17:00 | start before end |
| Detour limit for top-ups and mid-trip orders (km) | 25 | 0 to 500 |
| Pickup tolerance (%) | 2 | 0 to 50 |
| Average speed for estimates (km/h) | 30 | 5 to 120 |
| Road factor for estimates | 1.4 | 1 to 3 |
| Time at each stop (minutes) | 15 | 0 to 240 |
| Arrival buffer (%) | 20 | 0 to 200 |

A change applies on the next planning run (within 5 minutes) and is recorded in the activity log.

### 2. Manual actions on a live order
Each action asks for a reason, re-checks the rules in the database, and is written to the activity log.

| Action | Where | Rule |
|---|---|---|
| Move an order to another truck, or back to waiting | Orders | Only stops not yet done; warns when over the truck's capacity |
| Change the order of a driver's stops | Routes | An order's drop-off stays after its pickups; see Decision 1 |
| Re-source a pickup line from another farm | Orders | Before pickup; the farm's reservation is released |
| Cancel what is left of a line (record it as short) | Orders | Before pickup; creates the refund request |
| Complete a stop for the driver (phone dead) | Orders | Quantity, temperature and a note; no photo needed |
| Correct a recorded pickup quantity | Orders | Only until the order is delivered; see Decision 2 |

### 3. Exceptions
- The decision register gets titles, hints and a direct action for the newer kinds: "Order too large for one truck"
  (move or split), "Short supply" (open the refund), "No signal" (call the driver).
- The order board shows short and tolerated quantities and refund status per order.
- Each order shows its activity log: system events (dispatched, collected, topped up, refunded) and manual actions.

## Decisions (approved 2026-11-17)

1. A route ordered by hand keeps its order until the trip ends or ops press "Let the system order it"; new stops are
   added at the end (a top-up pickup moves its order's drop-off after it).
2. Quantity corrections are allowed until the order is delivered. A correction changes what the farmer is paid and
   their listing; top-ups and refunds already triggered by the first reading are not undone.
3. Any ops user can do any of these.
4. Over capacity is a warning, not a block. An order cannot move trucks once part of it is collected.
5. "Take from another farm" treats the first farm as unable to supply: it is not asked again for that order and the
   quantity leaves its listing.

## Not in this module

- Splitting one order across two trucks.
- Payout adjustments after delivery; disputes and payout holds.
- Role-based permissions inside ops.
- Editing products, prices, farmers or buyers (already on their own pages).

## Data changes

- `ops_actions (id, order_id, actor, action, reason, details jsonb, at)`, ops-read only, written by every manual function.
- `drivers.route_locked boolean`; `plan_routes` keeps a locked driver's existing sequence.
- Functions: `ops_reassign_order`, `ops_reorder_stops`, `ops_unlock_route`, `ops_resource_line`, `ops_cancel_line`,
  `ops_complete_stop`, `ops_correct_pickup`; each checks `is_ops()` and writes `ops_actions`.
- `ops_config` changes logged by trigger.

## Testing Strategy

- **pgTAP**: each function refuses non-ops; reassign respects done stops and warns over capacity; a locked route keeps
  its order after a new order arrives; re-source and cancel produce the same results as `shortfall`; complete-stop
  pays on the entered quantity; correction refused after delivery; every action is logged.
- **Jest**: service error mapping.
- **Manual**: each action from the dashboard on a test order.

## Success Criteria

- [ ] Every value in the settings table can be changed from the dashboard and takes effect within 5 minutes.
- [ ] Ops can move an order between trucks and the drivers' screens update.
- [ ] A reordered route keeps its order until unlocked or the trip ends.
- [ ] A dead-phone pickup can be completed by ops and the farmer is paid for the entered quantity.
- [ ] Every manual change appears in the order's activity log with who and why.
- [ ] Typecheck and lint show no new errors; jest and pgTAP pass.
