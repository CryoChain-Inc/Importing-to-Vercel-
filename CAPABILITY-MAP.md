# Capability Map: Fulfilment rework

Status: approved 2026-11-11. One branch per module off `dev`, named `feat/<module id>`, merged in build order.

| Module id | Responsibility | Depends on |
|---|---|---|
| `farmer-supply` | Listing edit rules, stock breakdown per listing, all photos shown | — |
| `app-sync` | Pull to refresh, refetch on app foreground, Supabase Realtime refetch — every role | — |
| `fleet` | Ops add and edit trucks (plate, capacity), assign a truck to a driver | — |
| `dispatch` | One pickup stop per farm, truck capacity, dispatch window, road ETA with buffer | `farmer-supply`, `fleet` |
| `shortfall` | Pickup tolerance, pay on collected quantity, farmer or driver reports a shortage, automatic re-sourcing from the nearest farm, escalate when no stock | `dispatch` |
| `refunds` | Buyer shortage notice, ops approval, Paystack refund, webhook confirmation | `shortfall` |
| `live-tracking` | Driver GPS during a trip, buyer and ops live map with ETA | `dispatch`, `app-sync` |
| `farmer-pickups` | Farmer pickup schedule and history: expected, collected, paid | `shortfall`, `app-sync` |
| `ops-control` | Ops overrides (reassign driver, edit allocation, reorder stops), exception views, config for every tunable above | all |

Build order: `farmer-supply`, `app-sync`, `fleet` → `dispatch` → `shortfall` → `refunds`, `live-tracking`, `farmer-pickups` → `ops-control`

## Decisions so far

- Listings stay one row each (a batch with its own photos and date). The double collection is fixed in `dispatch` by grouping stops per farm, not by merging listings.
- Fleet today: 2 trucks, 1000 kg each. Capacity lives on the truck, set by ops.
- Realtime uses Supabase Realtime; the app refetches on a change event rather than patching local state. Pull to refresh and foreground refetch cover missed events.
- Pickup tolerance is an ops setting (percentage). A collection within tolerance of the expected quantity triggers no re-sourcing and no refund.

## Approved defaults (all ops editable in `ops-control`)

- Driver GPS runs in the background during a trip (development build, Play Store background-location declaration).
- Refund = undelivered quantity × buyer price.
- Re-source detour limit 25 km; dispatch wait 120 minutes; pickup tolerance 2 %, no refund inside tolerance.
- After a listing is reserved the farmer may raise the quantity and add photos, not reduce below reserved or remove photos.
