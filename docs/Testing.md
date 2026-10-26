# CryoChain: manual testing guide

This walks through what the app is supposed to do, role by role, with the steps and the result you should see. Use it to learn the product and to smoke-test a build. Automated tests are listed at the end.

## 1. Setup

You need the app running (`npx expo start --web` is the quickest) against a Supabase project with all migrations applied. See the README for env vars.

### Test accounts

| Role | How to create | How to sign in |
|---|---|---|
| Farmer, Buyer | Self-signup in the app | Phone or email, then a 6-digit code |
| Ops | No invite is possible for the first one. Create an auth user with an email and password in the Supabase dashboard, then set that user's row in `profiles` to `role = 'ops'` | `/ops` with email and password |
| Driver | Ops invites from **Team** (needs a phone or email) | Phone or email, then a 6-digit code |

**Phone codes without sending SMS (local Supabase only).** `supabase/config.toml` defines fixed test numbers `233200000001` to `233200000005`, all with code `123456`. Type them as `020 000 0001`. Use five numbers for: farmer 1, farmer 2, buyer, driver, and a spare. On a hosted project these only work if you add the same test numbers in the dashboard; otherwise use email codes.

**Paystack.** Use a Paystack **test** secret key and the test card/mobile money numbers from Paystack's docs. Never run these steps with a live key.

**Minimum data before an order can work.** Ops needs at least one product with a **buyer price** and a **farmer price** for the grade (Prices and products), at least one collection point, and the farmer needs a listing with stock. A driver must have the route screen open so a location ping exists in the last 30 minutes.

### Suggested cast

Open each role in its own browser profile or window so sessions don't clash:
`Ops`, `Farmer A`, `Farmer B`, `Buyer`, `Driver`.

## 2. How the roles fit together

```
Ops sets up products, prices, team   ->   Farmers list stock   ->   Buyer orders and pays
                                                                         |
                  Ops watches the board, clears Decisions     <---  System allocates farmers, builds the driver route
                                                                         |
                                       Driver collects at farms, delivers   ->   Farmer share payable   ->   Ops pays out
```

| Role | Can do | Cannot do |
|---|---|---|
| Farmer | Manage own listings, accept or decline order offers, see own earnings, add a mobile money wallet | See buyer prices or other farmers' data |
| Buyer | Browse, cart, pay, cancel unpaid orders, book trucks, manage addresses | See farmer prices or payouts |
| Driver | See own route, share location, mark pickups collected and drop-off delivered, run truck trips | See orders they aren't routed on |
| Ops | Everything operational: catalogue, prices, farmers, buyers, orders, decisions, payments, payouts, routes, trucks, team, settings | n/a |

## 3. Test scripts

Each step says what to do and what you should see. Anything else is a bug.

### A. Sign-in and roles

| # | Step | Expected |
|---|---|---|
| A1 | Open `/`, enter a new test phone, continue | A code screen appears with a resend countdown |
| A2 | Enter a wrong code | "wrong code" style error, stays on the screen |
| A3 | Enter the right code (`123456` for test numbers) | "Who are you?" with only Farmer and Buyer. Note says drivers and ops join by invitation |
| A4 | Choose Farmer, continue | Farmer home, Listings tab. Quit and reopen: you land back on Farmer home (session resumes) |
| A5 | Sign in again with a number that already has a role | Skips role pick, goes straight to home |
| A6 | Open `/ops`, sign in with a farmer's email and any password | "That email and password do not match" or "does not have operations access", and you are signed out |
| A7 | Open `/ops`, sign in as ops | Ops dashboard with the side menu |
| A8 | Sign out from each role | Returns to landing (ops returns to `/ops`) |

### B. Ops set-up (do this first)

| # | Step | Expected |
|---|---|---|
| B1 | Team: invite a driver with name, a valid Ghana phone and email | Driver appears under Drivers. Bad phone or email shows an inline error and Send stays disabled |
| B2 | Prices and products: add a category, a product, a buyer price and a farmer price per grade | Product shows in the catalogue; buyers can see it in Shop |
| B3 | Settings: set min and max temperature, min above max is rejected | "Must be above min" and Save is disabled |
| B4 | Settings: save payout threshold, bank details, support phone | Button shows "Saved" |
| B5 | Cold trucks: set GH₵ per km | Saved; used in buyer truck quotes |

### C. Farmer

| # | Step | Expected |
|---|---|---|
| C1 | Profile: fill name, address (map or fields) and save | "Wallet needed" badge in the header until a wallet exists |
| C2 | Payments: add a mobile money wallet (network, number, name) | Wallet saved after verification; badge disappears |
| C3 | Listings > New listing: pick product, grade, weight, add a photo, pick a collection point, add | Listing card shows Sold 0, Delivered 0, Left = weight |
| C4 | Edit a listing | Changes saved |
| C5 | Remove a listing that has no sales | Removed. Remove is hidden once anything is sold or withdrawn |
| C6 | Look for any buyer price anywhere in the farmer app | None. Only the farmer price and payout amounts |

### D. Buyer shopping and payment

| # | Step | Expected |
|---|---|---|
| D1 | Account: add a delivery address (map pin or typed) and organization details | Account tab alert dot clears once the profile is complete |
| D2 | Shop: open a product, set kg with the stepper | Cannot go above available stock |
| D3 | Add to cart | Cart tab shows an alert dot |
| D4 | Cart: no address selected | "Check availability & pay" is disabled; "Add address" offered |
| D5 | Cart: kg greater than stock (change stock in another window to force it) then pay | Shortfall panel lists what is available, with "Continue with available" and "Review my cart". Per line "Reduce to N kg" also works |
| D6 | Cart with enough stock: Check availability & pay | Order created `awaiting_payment`, stock held for 30 minutes, payment page opens |
| D7 | Pay with a Paystack test method | Order becomes **paid**. Orders tab shows Order placed then Payment received |
| D8 | Abandon payment, return | Orders tab shows "Pay now" / "Try payment again" and "Cancel order" |
| D9 | Cancel an unpaid order | Order shows Cancelled; the stock is available again |
| D10 | Wait over 30 minutes on an unpaid order, then try to pay | The order is cancelled instead of charged |
| D11 | Look for any farmer price in the buyer app | None |

### E. Allocation and farmer offers (runs automatically after D7)

| # | Step | Expected |
|---|---|---|
| E1 | Farmer A (the nearest to the buyer): Messages tab | "Orders for your produce" shows an offer with kg and payout amount, Accept and Decline |
| E2 | Farmer A accepts | Offer becomes accepted; ops Orders board shows the allocation as accepted |
| E3 | Another order: Farmer A declines | Offer is re-allocated to the next farmer (Farmer B) with a new offer |
| E4 | Another order: nobody responds | After the 2 hour window an expiry job (every 10 minutes, needs pg_cron) marks it expired and re-allocates |
| E5 | Order bigger than any single farmer's stock | Split across more than one farmer |
| E6 | Order for a product with no total supply | Ops **Decisions** shows "Not enough supply" with that order |
| E7 | Product with no farmer price | Decisions shows "No farmer price" |
| E8 | SMS provider off or failing | Decisions shows "SMS not delivered". Farmer can still accept in the app |
| E9 | Fix the cause, then Decisions > Retry allocation | Allocation runs again; the decision auto-resolves or can be resolved with a note of 3+ characters |

### F. Driver route and delivery

| # | Step | Expected |
|---|---|---|
| F1 | Driver opens the app and allows location | Today's route shown. If denied: "Allow location so we can send you the nearest orders" |
| F2 | Paid, allocated order exists | Within a moment the route lists farm pickups first, then the buyer drop-off, numbered, nearest-first |
| F3 | Open Navigate on a stop | Opens Google or Apple Maps to that point |
| F4 | Tap Collected on a pickup | Stop moves to done; allocation becomes collected |
| F5 | Try to deliver before all pickups are done | Drop-off is never ordered before its pickups |
| F6 | Tap Delivered on the drop-off | Order complete; each farmer's allocation payout becomes **payable** and the farmer gets an "Order delivered" notification |
| F7 | No driver has pinged in the last 30 minutes, order paid | Decisions shows "No driver available". Once a driver opens the app the route builds itself |
| F8 | Two orders, two drivers | The new order goes to the driver with the lighter load |

### G. Payouts (Ops and Farmer)

| # | Step | Expected |
|---|---|---|
| G1 | Farmer: Payments tab before delivery | Earnings show as pending |
| G2 | Ops, Farmer payouts | Delivered orders appear under "To pay". Undelivered ones wait under "Waiting" until delivery |
| G3 | Select payable items (or Select all payable), create a run | Run is created and pre-checked |
| G4 | Run total above the payout threshold | Needs a second ops user to approve before release |
| G5 | Release funds | Paystack transfers are sent; items move to Sent, then Paid |
| G6 | A transfer fails | Use Retry; a sent transfer can be checked with Check with Paystack |
| G7 | Farmer Payments tab | Delivered and paid amounts reflect the above |
| G8 | Farmer without a wallet | Cannot be included in a run |

### H. Cold truck booking

| # | Step | Expected |
|---|---|---|
| H1 | Buyer, Truck: choose Transfer or Pick up, set From and To (map, search or "use my location"), pick a time | A quote appears from the per-km rate |
| H2 | Time in the past (more than 10 minutes ago) | Book is disabled |
| H3 | Book this truck | Booking `awaiting_payment`, listed under Your trips |
| H4 | Pay for this truck | Booking becomes **paid** |
| H5 | Ops Cold trucks: Assign a driver; optionally Set fare, Confirm payment, or Cancel booking | Driver sees the trip under Cold truck trips |
| H6 | Buyer opens a paid trip before it starts | Sees a 4-digit start code |
| H7 | Driver enters a wrong code, then the right code | Wrong rejected; right starts the trip ("On the way") |
| H8 | After start | Buyer sees the truck moving on the map; both can use trip chat |
| H9 | Cancel an unpaid booking | Cancelled; any pending payment is marked abandoned |

### I. Ops oversight

| # | Step | Expected |
|---|---|---|
| I1 | Dashboard | Counts reflect orders, supply, decisions, payments, payouts; panels link through |
| I2 | Orders board | Each order shows buyer, amount, items, allocations with farmer, kg and status, and the driver's stops in order. "Re-run allocation" works |
| I3 | Payments in | Buyer payments listed; stuck ones visible for review |
| I4 | Supply, Farmers, Buyers | Lists match what farmers and buyers created |
| I5 | Routes | Per-driver stops and states |
| I6 | Team | Invited staff listed by role |
| I7 | Non-ops user calls ops data directly (try with a farmer's session) | Rejected by row level security; no rows returned |

## 4. Edge cases worth trying

- Two buyers racing for the last kg: only one should hold it.
- Pay the same order twice (double tap, or reload on the payment page): charged once.
- Paystack webhook arriving before the browser returns: order still ends up paid exactly once.
- Amount or currency mismatch from Paystack: payment is flagged `mismatch`, order not marked paid.
- Reload on a deep web URL: returns to landing unless a session is saved.
- Offline: actions show an error banner rather than silently failing.
- Dark mode toggle: every screen stays readable.
- Narrow phone vs wide desktop: ops uses a side menu on wide screens; farmer and buyer use bottom tabs.

## 5. Automated tests

```bash
npm test               # Jest: auth service, cart logic, country data, shared components
npm run test:functions # Deno: Paystack signature check
npx tsc --noEmit
npx expo lint
```

There are no end-to-end tests. Sections C to H above are the regression script until some exist.

## 6. Not built yet (don't file as bugs)

From the client meeting in `docs/Flow.md`: partial-fulfilment confirmation after payment, refunds and refund approval, dispute workflow with payout holds, driver evidence capture (quantity and quality at pickup), live truck map for product orders (live tracking exists for truck bookings), route deviation alerts, and ETA.
