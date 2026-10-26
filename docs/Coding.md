# CryoChain V1 Architecture & Coding Standards

This guide outlines the standards and conventions for building the **`v1`** application cleanly alongside the legacy prototype.

---

## 1. Dual-App Switching Mechanism

The application is structured so that the existing legacy app remains 100% operational while `v1` is developed in parallel.

### How to Toggle Between Legacy and V1:

In [`src/App.tsx`](file:///home/gkl/Work/cryochain-prototype/src/App.tsx):

```typescript
// 1. Environment Variable Method (.env):
// EXPO_PUBLIC_USE_V1=true   -> Runs V1 App
// EXPO_PUBLIC_USE_V1=false  -> Runs Legacy App (Default)
const USE_V1 = process.env.EXPO_PUBLIC_USE_V1 === 'true';

// 2. Direct Code Toggle (during local development):
// You can change USE_V1 to true/false directly in src/App.tsx.
```

When `USE_V1 === true`, the root component mounts [`<V1App />`](file:///home/gkl/Work/cryochain-prototype/src/v1/App.tsx). When `false`, it runs the legacy app untouched.

---

## 2. Directory Structure Standards (`src/v1/`)

All new code belongs strictly inside `src/v1/`:

```text
src/v1/
├── components/                 # Reusable Presentational UI (Dumb components)
│   ├── common/                 # Buttons, Inputs, Cards, Badges, Headers
│   ├── layout/                 # Screen containers, split layouts, sticky bars
│   └── feedback/               # Modals, Toast notifications, Loading spinners
│
├── features/                   # Business domain modules by user persona
│   ├── auth/                   # Login, Register, Password Reset
│   ├── buyer/                  # Catalog, Cart, Orders, Handover validation
│   ├── ops/                    # OrderBook, Allocation, Dispatch, Node fleet
│   ├── farmer/                 # Harvest registration, Batches, Payout history
│   ├── agent/                  # Weighing, Grading, Cold manifest collection
│   └── driver/                 # Delivery run, Cold checks, Custody handover
│       └── Each feature has:
│           ├── screens/        # Route views (keep thin, under 200 lines)
│           ├── components/     # Feature-specific UI components
│           └── hooks/          # Business logic & local state
│
├── navigation/                 # Routing, guards, and tab/stack navigators
├── services/                   # Supabase client, auth, and backend integrations
│   ├── supabase.ts             # Client config & EdgeFunction enum
│   ├── auth.service.ts         # User authentication & session state
│   └── api/                    # Domain API modules (orders, catalog, etc.)
│
├── theme/                      # Visual tokens (colors.ts, typography.ts)
├── types/                      # Shared TypeScript data models
└── utils/                      # Pure helper functions (currency, dates, formatting)
```

---

## 3. Centralized Enum for Edge Functions

> **Rule:** Never use hardcoded string literals (magic strings) when calling Edge Functions. Always register them in the `EdgeFunction` enum.

### The Enum Definition:
In [`src/v1/services/supabase.ts`](file:///home/gkl/Work/cryochain-prototype/src/v1/services/supabase.ts):

```typescript
export enum EdgeFunction {
  // Legacy edge functions (kept for backward compatibility)
  Commit = 'commit',
  ClaimInvite = 'claim-invite',
  SendSms = 'send-sms',
  ChargePayment = 'charge-payment',
  PayoutTransfer = 'payout-transfer',

  // V1 edge functions
  V1Orders = 'v1-orders',
  V1Payments = 'v1-payments',
  V1Telemetry = 'v1-telemetry',
}
```

### How to Call an Edge Function:
Always use `invokeEdgeFunction` with the enum member:

```typescript
import { invokeEdgeFunction, EdgeFunction } from '../supabase';

export async function processPayment(orderId: string, amount: number) {
  const { data, error } = await invokeEdgeFunction(EdgeFunction.V1Payments, {
    orderId,
    amount,
  });

  if (error) {
    throw new Error(`Payment processing failed: ${error}`);
  }

  return data;
}
```

**Benefits:**
- Autocomplete in your IDE.
- Zero risk of typos in function names.
- If a function name changes on the backend, updating the enum updates every caller automatically.

---

## 4. Database Queries vs. Edge Functions Rule

Follow this golden rule when building services in `src/v1/services/api/`:

| Use Case | Approach | Reason |
| :--- | :--- | :--- |
| **Catalog browsing, order history, profile data** | **Direct DB query** (`supabase.from('...')`) | Fast, native PostgreSQL performance, secured by Row Level Security (RLS). |
| **Payments (Paystack/Stripe), SMS alerts, payouts** | **Edge Function** (`invokeEdgeFunction(...)`) | Requires secret keys and service-role privileges that must never leak to the client. |

---

## 5. Coding & Commenting Conventions

1. **Self-Documenting Code + Purposeful Comments:**
   - Write clear function and variable names.
   - Add comments explaining **why** a decision was made (business rules, edge cases), not just **what** the code does.
2. **File Size Limit:**
   - Keep files under 200–250 lines.
   - If a screen is growing large, extract sections into `features/<role>/components/`.
3. **Strict Typing:**
   - Avoid `any`. Define request/response payloads in `src/v1/types/` or directly inside service files.
4. **Theme Usage:**
   - Always reference colors and typography from `src/v1/theme/` (e.g., `colors.brand`, `colors.ink`, `fonts.sansBold`). Avoid hardcoded hex colors in components.
