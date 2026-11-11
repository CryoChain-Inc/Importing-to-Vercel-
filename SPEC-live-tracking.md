# Spec: live-tracking

Module `live-tracking` from `CAPABILITY-MAP.md`. Branch: `fea/live-tracking` (off `fea/farmer-pickups`).
Status: approved 2026-11-16.

## Objective

While a truck is on a trip, its position keeps updating even with the driver's phone locked, and buyers and ops can
see on a map where it is, the road it will take, and when it will arrive.

## How it works today

- The driver's position is sent every 30 seconds only while the driver home screen is open
  (`DriverHome.tsx`, foreground only). A locked phone stops it.
- Only the latest position is kept (`driver_locations`), so there is no trail and no way to spot a detour.
- Buyers have no map for product orders (the existing `TripMap` is for cold-truck bookings and is web only).
- Ops see each driver's last position as text on the Routes page.

## Behaviour

### 1. Driver: background GPS during a trip
- Starts automatically when the driver has a dispatched stop; stops when the last stop is done or the driver signs out.
- Sends a position every 30 seconds or 100 m, whichever comes first, also with the phone locked.
- Android shows a persistent notification while it runs: "CryoChain is sharing your location for today's deliveries."
- The first time, the app explains why, asks for location "while using", then for "all the time" (Android opens system
  settings for that step). If refused, it falls back to today's foreground pings and shows a banner.
- Each position also refreshes the Google arrival times (`route-eta`, at most every 3 minutes, as now).

### 2. Trail
Positions during a trip are kept in `driver_location_trail` so ops can see the route driven. Kept 30 days, then
deleted by a daily job. Outside a trip, nothing is stored beyond the latest position.

### 3. Buyer: live order map
On a paid order that is on a truck, the order detail shows a map with the truck's position (updated every 15 seconds
while the map is open), the buyer's own address and the arrival time with buffer.
- **No other stops are revealed**: no markers, no count, no addresses. While other stops come first the map shows the
  truck and the buyer's address only, with "The driver is collecting produce on the way".
- Once the buyer's drop-off is the truck's next stop, the road line from the truck to them is drawn.
Before dispatch nothing is shown; after delivery the map is replaced by the delivered time.

### 4. Ops: live map
The Routes page gets a map with every active truck, its remaining stops in order, and its planned road route. A truck
that has not reported for 10 minutes is marked "No signal".

## Decisions (approved 2026-11-16)

1. `expo-task-manager` added. Background tracking needs a development build; Expo Go cannot run it.
2. Buyers never see other stops (see 3 above).
3. The trail is ops-only and kept 30 days.
4. Road lines come from the same Google Routes request already made for arrival times (`routes.legs.polyline`).
5. Google Play needs the background-location declaration and video before release.
6. Background tracking is Android only; iOS and the web app keep foreground pings.

## Not in this module

- Route-deviation alerts (ops see the trail; automatic alerts can follow in `ops-control`).
- Live tracking for cold-truck bookings (they keep their current foreground tracking).
- iOS background mode (Android only for now; iOS keeps foreground pings).

## Data changes

- `driver_location_trail (driver_id, lat, lng, at)`, written by `report_driver_location` while the driver has pending
  stops; daily `pg_cron` cleanup.
- `delivery_stops.leg_polyline`: Google's road line from the previous point to each stop, written by `route-eta`.
- `public.buyer_order_tracking(order)`: truck position, ETA and polyline for the buyer's own order only.
- `app.json`: `expo-location` plugin `isAndroidBackgroundLocationEnabled: true`.

## Testing Strategy

- **pgTAP**: trail written only during a trip; a buyer gets tracking only for their own order and never farm or other
  buyers' locations; cleanup removes rows older than 30 days.
- **Jest**: polyline decoding; background task posts a position.
- **Manual on an Android development build**: lock the phone during a trip and watch the ops map move; deny "all the
  time" and check the fallback; buyer map updates and shows the arrival time.

## Success Criteria

- [ ] With the phone locked for 10 minutes on a trip, ops see the truck move and the trail recorded.
- [ ] The background task stops after the last stop.
- [ ] A buyer sees the truck, the road to them and the arrival time; no farm or other buyer appears.
- [ ] Ops see all active trucks on one map, with "No signal" after 10 minutes of silence.
- [ ] Typecheck and lint show no new errors; jest and pgTAP pass.
