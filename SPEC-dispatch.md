# Spec: dispatch

Module `dispatch` from `CAPABILITY-MAP.md`. Branch: `fea/dispatch` (off `fea/fleet`, which holds the three merged modules).
Status: approved 2026-11-12.

## Objective

Paid orders are grouped into truck loads and driven as one sensible route: one visit per farm, loads that fit the
truck, a short wait to fill the truck, and an arrival time for every stop that farmers, buyers and ops can rely on.

## How it works today (what this replaces)

- One pickup stop per allocation, and one allocation per listing: two listings at one farm are two stops.
- Each order goes to the driver with the fewest pending stops; truck capacity is ignored.
- Orders are routed the moment they are paid; nothing waits to fill a truck.
- No arrival times. Every farmer is told "08:00 tomorrow" at allocation.

## Behaviour

### 1. One line per farm, product and order
A pickup stop covers every allocation of one product from one farm for one order. Two 50 kg tomato listings from the
same farmer for the same order become one line, "Tomato 100 kg". The driver weighs once. The recorded quantity is
split across the listings oldest first, so stock and payouts per listing still add up.

Lines at the same farm are driven consecutively and shown to the driver as one farm visit.

### 2. Loads that fit the truck
- A driver is dispatchable when they have an in-service truck (from `fleet`), have shared a location in the last
  30 minutes, and have no unfinished stops.
- Waiting orders are loaded oldest first while the total stays within the truck's capacity. An order is never split
  across trucks.
- An order larger than every truck is not dispatched; it raises an ops decision ("Order too large for one truck").
- A driver with a trip in progress can still take a nearby order that fits (see Decisions).

### 3. Dispatch window
A load leaves when either is true:
- the next waiting order no longer fits (the truck is as full as it will get), or
- the oldest order in the load has waited the dispatch window (default 120 minutes).

Dispatch only starts inside working hours (default 06:00 to 17:00, Africa/Accra). A scheduled job checks every
5 minutes, so nothing depends on someone opening the app.

### 4. Route order
Unchanged rule: nearest next stop from the truck's position, and an order's drop-off only after all its pickups.
Because same-farm lines share a location they stay together.

### 5. Arrival times with buffer
Every stop gets an estimated arrival, recalculated when the route is planned, when a stop is completed, and when the
driver's location updates:

`travel time = road distance ÷ average speed`, `road distance = straight-line × road factor`, plus a fixed time at
each stop, then the whole estimate is stretched by the buffer.

Defaults (all ops settings): average speed 30 km/h, road factor 1.4, 15 minutes per stop, buffer 20 %.

At dispatch the farmer gets an in-app notice and SMS with the real pickup window ("today around 14:30") instead of
"08:00 tomorrow". At allocation they are only told the produce is reserved.

### 6. Driver screen
The Delivery tab shows the trip as an ordered route: farm visits (each listing its lines per order and product) and
drop-offs, each with its estimated arrival. Recording a line keeps today's form (quantity, temperature, photo).

## Decisions (approved 2026-11-12)

1. **Arrival times come from Google**, with a database estimate underneath. Every stop gets the estimate at once (so
   there is always a time, and the farmer's SMS can state one). The `route-eta` edge function replaces it with Google
   Routes traffic-aware drive times each time the driver's app reports a location, at most once every 3 minutes.
2. **Capacity is an internal load figure.** An order's load is the sum of its quantities; nothing is relabelled in kg.
3. **Temperature and photo are recorded per line**, reusing the current form.
4. **Mid-trip additions are allowed.** A waiting order joins a truck already on the road when it fits the remaining
   capacity and each of its stops is within `detour_km` (25) of the remaining route or the truck. A new line on an
   order already on a truck (a shortage top-up) always rides with that truck.
5. **The dispatch window is a wait before departure only**, never at a stop. 0 means every order leaves at once.

## Not in this module

- Short pickups, tolerance, re-sourcing (`shortfall`).
- Live map, background GPS, Google ETA (`live-tracking`).
- Ops reassigning drivers or reordering stops by hand, and the settings screen for the new values (`ops-control`).
  The values exist in `ops_config` with the defaults above.

## Data changes

- `order_allocations.pickup_stop_id` → the stop that collects it. `delivery_stops.allocation_id` stays for stops
  already in flight and is no longer written.
- `delivery_stops.eta` (timestamptz), `delivery_stops.dispatched_at`.
- `ops_config`: `dispatch_wait_minutes`, `dispatch_start`, `dispatch_end`, `avg_speed_kmh`, `road_factor`,
  `stop_minutes`, `eta_buffer_pct`.
- `ops_decisions.kind` gains `over_capacity`.
- Rewritten: `private.plan_routes`, `private.allocate_order` (notice text only), `public.driver_deliveries`,
  `public.complete_delivery_stop`, `public.record_delivery_handover` (unchanged signature).
- New: `private.refresh_etas(driver)`, a 5-minute `pg_cron` job calling `plan_routes`.

Stops already assigned when this ships keep their driver and are finished under the old one-stop-per-allocation shape.

## Commands

```
Typecheck:  npx tsc --noEmit
Lint:       npx expo lint
Unit tests: npm test
DB tests:   npx supabase test db
Local DB:   npx supabase db reset
```

## Project Structure

```
supabase/migrations/     one migration for the data changes and functions
supabase/tests/          dispatch.test.sql
src/services/driver.deliveries.service.ts, ops.fulfilment.service.ts
src/features/driver/components/DeliveryList.tsx, DeliveryOrderPage.tsx
src/features/ops/components/RoutesPanel.tsx, OrdersBoard.tsx   (show ETA and merged lines)
```

## Testing Strategy

- **pgTAP**: merged line for two listings; capacity respected with two trucks; an order waits inside the window and
  leaves after it; nothing dispatches outside working hours; over-capacity raises a decision; ETAs increase along the
  route and move when a stop completes; recorded quantity splits across listings oldest first.
- **Jest**: service mapping of the route shape.
- **Manual**: driver screen on Android with a two-order trip.

## Boundaries

- Always: keep in-flight stops working; every rule in the database; typecheck, lint and tests before done.
- Ask first: changes to payouts or payment functions; any new dependency or paid API call.
- Never: commit; delete stop, allocation or handover history.

## Success Criteria

- [ ] A farmer with two 50 kg tomato listings on one order appears to the driver as one 100 kg line.
- [ ] Two farms and one buyer on a 1000 kg truck: one trip, each farm visited once, drop-off last.
- [ ] 700 kg and 600 kg orders with two 1000 kg trucks go on separate trucks; with one truck the second waits.
- [ ] A lone 200 kg order is dispatched 120 minutes after payment, not before, unless the truck fills.
- [ ] A 1500 kg order raises "too large for one truck" and is not dispatched.
- [ ] Every pending stop has an arrival time; completing a stop updates the later ones.
- [ ] The farmer's notice at dispatch states the estimated pickup time.
- [ ] Typecheck and lint show no new errors; jest and pgTAP pass.
