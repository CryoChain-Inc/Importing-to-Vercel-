# CryoChain v1 prototype

A working prototype of the CryoChain version one product: five roles on one codebase, backed by an in-browser event store so every flow runs end to end with real state.

- **Buyer**: category ordering, requester and approver roles with limits, bank transfer, card and mobile money, delivery acceptance and rejections, credit notes, temperature record, organisation users. Phone first, with a desktop layout.
- **Farmer**: pickups, prices, payments and the SMS log.
- **Field agent**: manifest, farmer registration with consent, weigh and grade with mandatory photographs, Into cold box lock, decline, ad hoc consignments, offline capture and sync queue.
- **Driver**: run, stop stamps, temperature checkpoints with gauge photograph and app-stamped time, delivery with per-line rejection and signature, complete run gate.
- **Operations**: order book, allocation and re-cut, run builder, capture arriving, deliveries and dispositions, settlements with 24 hour clocks, payout runs with threshold and two-person approval, transfers with idempotent retry and manual path, exceptions queue, buyers, farmers, config, sync health, messages, audit.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # domain rules: settlement, re-cut, approvals, transfers, seed invariants
npm run build
```

## How the demo works

All state lives in `localStorage` (key `cryochain-proto-v5`) and is seeded from `src/domain/seed.ts` around today's date. The bar at the bottom left switches role, switches the person you are acting as, and resets the data. Field devices can be taken offline from the sync bar: captures are held on the device and their server-side effects (SMS, settlements, exceptions) apply at sync.

The five flows to walk are listed on the landing page.

## Structure

- `src/domain/types.ts` entities; `logic.ts` pure rules; `seed.ts` demo data; `store.tsx` actions and server-side effects (`applyEffects`).
- `src/ui/kit.tsx` shared components from the design system; `src/styles.css` tokens.
- `src/roles/*` one folder per role.
- `src/tests` vitest.

The design system and buyer screens follow the CryoChain v1 design canvas (Inter, Fraunces for heroes, ink/paper/blue/green palette). Farmer, agent, driver and ops surfaces follow the same components and the detailed scope.
