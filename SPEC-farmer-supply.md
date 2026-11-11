# Spec: farmer-supply

Module `farmer-supply` from `CAPABILITY-MAP.md`. Branch: `feat/farmer-supply`. Status: approved 2026-11-11.

## Objective

A farmer can see exactly what happened to each batch they listed, can see every photo they uploaded, and can edit a
listing only in ways that cannot break an order that is already relying on it.

Each listing stays its own row (a batch). Two 50 kg tomato listings from one farmer remain two batches; the farmer's
product group shows their combined totals. Collecting them in one visit is `dispatch`, not this module.

### Behaviour

1. **Stock breakdown.** Each listing, and each product group, shows four numbers in the product's unit:
   listed, reserved (allocated to an order, not yet collected), collected, and available (listed − reserved − collected − withdrawn).
2. **Photos.** The listing detail screen shows all 3 to 6 photos, not only the first.
3. **Edit rules.** "Reserved" below means the listing has at least one allocation that is not cancelled.

   | Listing state | Change product | Change quantity | Photos | Delete |
   |---|---|---|---|---|
   | Nothing reserved | Yes | Any value above zero | Add, replace, remove (keep 3 to 6) | Yes |
   | Partly or fully reserved | No | Up, or down to the reserved + collected amount | Add only (up to 6) | No |
   | Everything collected or delivered | No | No | No | No |

   Reducing below the reserved amount is refused with a message that names the reserved quantity. Telling CryoChain
   "I cannot supply what is reserved" is a shortage report and belongs to `shortfall`.

### Not in this module

- One pickup stop per farm (`dispatch`).
- Shortage reporting, tolerance and re-sourcing (`shortfall`).
- Pickup schedule and history screen (`farmer-pickups`).
- Live updates and pull to refresh (`app-sync`).

## Assumptions

1. The `listing_stock` view already gives sold, delivered, withdrawn and remaining; it is extended, not replaced.
2. Photo editing does not exist today (`EditListing` says photos stay as uploaded); this module adds it under the rules above.
3. Produce photos are public URLs via `produceImageUrl`; no signed URLs are needed.
4. The legacy `lot_id` path keeps its current behaviour (a listing in a lot cannot be edited).

## Tech Stack

Expo SDK 57, React Native, TypeScript, Supabase (Postgres functions, RLS, Storage). No new dependencies.

## Commands

```
Typecheck:  npx tsc --noEmit
Lint:       npx expo lint
Unit tests: npm test
DB tests:   npx supabase test db
Local DB:   npx supabase db reset
Dev:        npx expo start
```

## Project Structure

```
supabase/migrations/   one new migration: listing_stock columns, update_own_listing, photo update function
supabase/tests/        new: pgTAP test for the edit rules
src/services/farmer.service.ts              listing fields, updateListing errors, photo update call
src/services/__tests__/                     jest tests for the service mapping
src/features/farmer/components/             EditListing, ListingCard, ProductGroup, PhotoPicker (reused)
src/features/farmer/screens/ProduceDetail.tsx   photo gallery, stock breakdown
```

`docs/Coding.md` describes a `src/v1/` tree that does not exist; follow the code as it is under `src/`.

## Code Style

Follow the existing service pattern: one exported function per call, database errors mapped to a plain sentence.

```ts
export async function updateListing(id: string, product: string, weightKg: number, unit: string): Promise<void> {
  const { error } = await supabase.rpc('update_own_listing', { p_id: id, p_product: product, p_unit: unit, p_weight_kg: weightKg });
  if (!error) return;
  const msg = error.message ?? '';
  if (msg.includes('been delivered')) throw new Error('This produce has been delivered, so it can no longer be edited.');
  throw new Error('Could not save your changes.');
}
```

Database rules live in `security definer` functions with `set search_path = ''`; the client never writes these tables directly.

## Testing Strategy

- **pgTAP** (`supabase/tests/`): the edit-rule table above, one assertion per cell that changes behaviour, plus the stock numbers after allocate, collect and withdraw.
- **Jest**: `farmer.service` maps the new stock fields and error messages.
- **Manual on Android**: gallery shows every photo; edit screen disables what the rules forbid.

## Boundaries

- Always: enforce every rule in the database function, not only in the screen; run typecheck, lint and tests before calling a task done.
- Ask first: any change to `order_allocations`, payouts, or existing migrations; any new dependency.
- Never: commit (the owner commits; hand over the git commands); edit `ios/` or `android/`; delete listing or allocation history.

## Success Criteria

- [ ] A listing with 100 listed, 60 reserved, 0 collected shows 100 / 60 / 0 / 40.
- [ ] After the driver collects that 60, it shows 100 / 0 / 60 / 40.
- [ ] A farmer with two tomato listings sees both batches and one combined group total.
- [ ] The detail screen shows every uploaded photo.
- [ ] With 60 reserved: setting quantity to 50 is refused naming 60; setting it to 60 or 150 succeeds; product change and delete are refused; adding a photo succeeds; removing one is refused.
- [ ] With nothing reserved: all edits and delete succeed.
- [ ] Typecheck, lint, jest and pgTAP pass.

## Open Questions

None. Raising quantity and add-only photos after reservation were approved.
