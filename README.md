# CryoChain

A cold-chain produce marketplace for Ghana. **Farmers** list produce, **buyers** order it from a cart, the system picks which farmers supply the order and routes a **driver** to collect and deliver it, and an **ops team** oversees everything and pays the farmers. Buyers can also book a standalone **cold truck**.

One Expo / React Native codebase runs on Android, iOS and the web. The backend is Supabase (Postgres, Auth, Edge Functions). Payments go through Paystack, SMS through Twilio, maps through Google Maps.

- How to test it by hand: [docs/Testing.md](docs/Testing.md)
- Why the product works this way (client meeting notes): [docs/Flow.md](docs/Flow.md)
- Code conventions: [docs/Coding.md](docs/Coding.md)

## Roles

| Role | Who | How they get in | Home screen |
|---|---|---|---|
| Farmer | Sells produce | Self-signup (phone or email code), picks "Farmer" | Listings, Messages, Payments, Profile |
| Buyer | Orders produce, books trucks | Self-signup, picks "Buyer" | Shop, Cart, Orders, Truck, Account |
| Driver | Collects and delivers | Invited by ops (Team tab) | Today's route, cold truck trips |
| Ops | Runs the operation | Invited by ops, signs in at `/ops` with email and password | Dashboard and a side menu of panels |

A new account that has not picked a role is `pending`. Farmer and buyer are the only roles offered at signup. Drivers and ops can't be self-assigned; the server assigns them on invite.

## How an order moves through the system

```
Buyer builds cart  ->  checks availability  ->  stock held 30 min  ->  pays via Paystack
                                                                          |
                                                                       order = paid
                                                                          |
   System allocates kg to farmers (nearest to the buyer first)  <---------+
        |   each farmer gets an SMS + in-app offer (2 hour window)
        |   accept -> stays | decline / no answer -> re-allocated to the next farmer
        v
   System builds the driver's route: farm pickups first, then the buyer drop-off
        |   driver = least-loaded driver who shared a location in the last 30 min
        v
   Driver taps "Collected" at each farm, "Delivered" at the buyer
        v
   Delivered -> each farmer's share becomes payable -> ops groups them into a payout run -> Paystack transfer to the farmer's mobile money wallet
```

Anything the system can't settle on its own lands in the **Decisions** tab for ops: not enough supply, no farmer price set, no driver available, SMS failed, allocation error.

Pricing is split by role: buyers see only the buyer price, farmers only what they are paid (`farmer_price x kg`). Ops sees both.

### Cold truck booking (separate from orders)

Buyer picks pickup and drop-off on a map and a time, gets a fare quote (per-km rate set by ops), and books. Ops assigns a driver and can set the fare or confirm payment. After payment the buyer sees a 4-digit start code; the driver enters it to start the trip, and the buyer then watches the truck live. Buyer and driver can chat on the trip.

## Tech

- Expo SDK 57, React Native 0.86, React 19, TypeScript. No router library: navigation is a small custom stack in `src/navigation/` that also drives browser history on web.
- Supabase: Postgres with row level security, Auth (SMS and email codes), Edge Functions. Writes to sensitive tables only go through database functions.
- Edge Functions (`supabase/functions/`): `paystack-init`, `paystack-verify`, `paystack-webhook`, `truck-pay`, `truck-pay-verify`, `payout-run`, `verify-wallet`, `invite-staff`, `dispatch-sms`, `maps-proxy`, `send-auth-email`.
- Tests: Jest (`jest-expo`) for the app, Deno for Edge Functions.

## Project layout

```
src/
  App.tsx                 root: fonts, theme, navigation, session restore
  navigation/             tiny route stack (landing, ops, verify, role, workspace, home)
  features/
    auth/                 landing, OTP verify, role pick, ops login
    farmer/ buyer/ driver/ ops/   one folder per role (screens + components)
    truck/                trip progress map + chat, used by buyer and driver
    home/HomeScreen.tsx   picks the role's home screen
  services/               Supabase calls, one file per area
  components/             shared UI (common, layout, feedback, location)
  theme/ utils/ data/ types/
supabase/
  migrations/             schema, RLS, allocation/route/payout logic
  functions/              Edge Functions
  config.toml             local Supabase config (incl. test phone numbers)
docs/                     Flow.md, Coding.md, Testing.md
```

## Running it locally

Prerequisites: Node 20+, [Bun](https://bun.sh) or npm, and a Supabase project (hosted, or local via the Supabase CLI and Docker).

```bash
npm install
cp .env.example .env.local     # then fill in the values below
npx expo start                 # press w for web, a for Android, i for iOS
```

`.env.local`:

| Variable | Needed for |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Everything. Without it the app can't sign in. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or `EXPO_PUBLIC_SUPABASE_KEY`, a `sb_publishable_` key) | Everything |
| `EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY` | Maps on web |
| `GOOGLE_MAPS_ANDROID_KEY`, `GOOGLE_MAPS_IOS_KEY` | Maps in native builds (read by `app.config.js`) |

Edge Function secrets are set in Supabase, never in the app: `PAYSTACK_SECRET_KEY`, `APP_URL`, `GOOGLE_MAPS_SERVER_KEY`, and the SMS provider keys (see `.env.example`).

Apply the database schema with the Supabase CLI (`supabase db push`, or `supabase start` for a local stack that applies `supabase/migrations/`).

Map and location features use native modules, so they need a development build rather than Expo Go: `npx expo run:android` or `npx expo run:ios`. The web build works with `npx expo start --web`.

### Useful commands

```bash
npm test               # Jest
npm run test:functions # Deno tests for Edge Functions
npm run test:all
npx tsc --noEmit       # typecheck
npx expo lint
npm run format
```

### Routes on web

`/` landing and sign-in, `/ops` staff sign-in, `/email-verified` landing page for emailed confirmation links. Other screens keep their state in memory, so reloading a deep URL returns to the landing page unless a session is saved (a saved session resumes to the role's home).

## Deploying

Web is deployed on Vercel (`vercel.json`). Native builds use EAS (`npx eas-cli@latest build`).

## Known limits

- Order status for buyers is `awaiting_payment`, `paid` or `cancelled`. Delivery progress comes from the driver's stops, not a separate order status.
- The client's later requirements in `docs/Flow.md` (buyer confirming a partial quantity as a separate step, refunds, disputes with payout holds, route-deviation alerts) are only partly built. Today a cart that exceeds stock offers "Continue with available", and a shortfall after payment goes to ops as a "Not enough supply" decision.
- `docs/Coding.md` describes an older legacy/V1 split that is no longer in `src/`.
