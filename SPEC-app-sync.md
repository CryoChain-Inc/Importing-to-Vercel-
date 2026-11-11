# Spec: app-sync

Module `app-sync` from `CAPABILITY-MAP.md`. Branch: `fea/app-sync`.

## Objective

Every role sees current data without leaving and reopening a screen.

## Behaviour

1. **Pull to refresh** on the farmer, buyer, driver and ops home screens and the farmer product detail screen (phones; browsers have no pull gesture).
2. **Live reload**: when a table the screen depends on changes for the signed-in user, the screen reloads within about a second. Bursts of changes cause one reload.
3. **Foreground reload**: returning to the app reloads the screen.
4. **Safety net**: one reload a minute while the app is open, for changes the user's database permissions hide from live events and for events missed while offline.

| Role | Tables watched |
|---|---|
| Farmer | `produce_listings`, `order_allocations`, `notifications` |
| Buyer | `orders`, `payments`, `truck_bookings` |
| Driver | `delivery_stops`, `truck_bookings` |
| Ops | `orders`, `payments`, `order_allocations`, `delivery_stops`, `ops_decisions`, `produce_listings`, `truck_bookings` |

The screen reloads its data on an event; it does not patch local state from the event payload.

## Not in this module

- Driver location on a map (`live-tracking`).
- Push notifications when the app is closed.
- Removing the existing per-screen timers (truck trip, payment, farmer offline upload); they stay as they are.

## Structure

- `src/services/liveReload.ts`: `watchChanges` (subscription, debounce, foreground, poll) and the `useLiveReload` hook.
- `TabShell`, `OpsShell`: optional `refresh` prop for pull to refresh.
- `supabase/migrations/20261111100000_realtime_tables.sql`: adds the tables above to the realtime publication (safe to re-run).

## Testing

- Jest: `src/services/__tests__/liveReload.test.ts` (one reload per burst, minute poll, nothing after stop).
- Manual on two devices: change data as one role, watch the other update; pull to refresh on Android.

## Success Criteria

- [ ] Ops marks an order paid on one device; the buyer's Orders tab updates on another within a few seconds without touching it.
- [ ] A driver completes a pickup; the farmer's listing shows it collected without reopening the screen.
- [ ] Pulling down on any role's home screen on Android shows the spinner and reloads.
- [ ] Typecheck and lint show no new errors; jest passes.
