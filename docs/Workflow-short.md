# CryoChain End-to-End Operational Workflow Specification

> **Document Code:** `CW-OPS-WF-001 Rev 1.0`\
> **Status:** Production Reference\
> **System Scope:** Multi-Role Operations, Exception Management, Automated
> Aggregation & Route Optimization\
> **Applicable Documents:**
> [00-program-charter.md](file:///home/gkl/Work/Market-Place/docs/00-program-charter.md),
> [02-domain-model.md](file:///home/gkl/Work/Market-Place/docs/02-domain-model.md),
> [03-payments-and-escrow.md](file:///home/gkl/Work/Market-Place/docs/03-payments-and-escrow.md),
> [04-role-specifications.md](file:///home/gkl/Work/Market-Place/docs/04-role-specifications.md),
> [05-offline-and-sync.md](file:///home/gkl/Work/Market-Place/docs/05-offline-and-sync.md),
> [06-ussd-and-sms.md](file:///home/gkl/Work/Market-Place/docs/06-ussd-and-sms.md),
> [07-security-and-fraud.md](file:///home/gkl/Work/Market-Place/docs/07-security-and-fraud.md),
> [14-metrics-and-unit-economics.md](file:///home/gkl/Work/Market-Place/docs/14-metrics-and-unit-economics.md)

---

## 1. Executive Architecture & Role Separation

The CryoChain operating model runs on **one shared codebase deployed as an
Android-first mobile application** for field operations
([ADR 0001](file:///home/gkl/Work/Market-Place/docs/adr/0001-single-codebase-role-gated.md)),
coupled with an **authenticated desktop operations console**
([ADR 0009](file:///home/gkl/Work/Market-Place/docs/adr/0009-ops-console-low-code.md))
for financial clearance.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PUBLIC "ZERO-LOGIN" LAYER                       │
│  - Live Published Price Board (Tomatoes, Peppers, Onions, Mango)        │
│  - Transparent crop categories & quality standards                     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Authentication Trigger
       ┌───────────────────────────┼───────────────────────────┐
       ▼                           ▼                           ▼
┌──────────────┐            ┌──────────────┐            ┌──────────────┐
│    FARMER    │            │ BUYER/OFFTK  │            │ STAFF (FIELD)│
│  MSISDN/OTP  │            │ Email+PW+OTP │            │ Device-Bound │
│ or USSD *XXX#│            │              │            │ Agent/Driver │
└──────┬───────┘            └──────┬───────┘            └──────┬───────┘
       │                           │                           │
       ▼                           ▼                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 POSTGRESQL ROW-LEVEL SECURITY (RLS)                    │
│ JWT claims enforce access at database layer: zero client privilege leak│
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ High-Privilege Desk Boundary
                                   ▼
                            ┌──────────────┐
                            │ OPS/FINANCE  │
                            │ Corporate SSO│
                            │ Hardware 2FA │
                            └──────────────┘
```

---

## 2. Role Lifecycles, Interactions & Exceptions

### 2.1 Farmer

#### A. Account Creation & Onboarding

- **In-Person Field Registration (Primary Path):** Registered by Field Agents in
  the field using the agent app
  ([04-role-specifications.md § 4.2](file:///home/gkl/Work/Market-Place/docs/04-role-specifications.md#L144)).
  Agent captures:
  - Full Name
  - Registered Mobile Money Phone Number (MSISDN)
  - Network Rail (`MTN MoMo`, `Telecel Cash`, or `AT Money`)
  - Optional: National Ghana Card number
- **Automated KYC Name Enquiry Verification:** On device sync, the backend
  executes an asynchronous Mobile Money API name enquiry. The account is marked
  _verified_ only when the telecom wallet registered name matches the farmer
  identity
  ([07-security-and-fraud.md § 5.2](file:///home/gkl/Work/Market-Place/docs/07-security-and-fraud.md#L145-L147)).
- **Self-Registration (Secondary Path):** Via USSD (`*XXX#`) or app using SMS
  OTP verification.

#### B. Normal Interaction Flow

1. **View Price Board:** Checks today’s published farm gate price
   (`published_prices`) without logging in (e.g. Tomatoes at GHS 4.20/kg).
2. **List Produce (Create Consignment):** Selects crop, enters estimated
   kilograms (e.g., 800 kg), and selects collection point.
3. **Provisional Settlement Preview:** The app/USSD displays: _"Provisional
   value: GHS 3,360.00. Final amount is set by weight and grade recorded at
   collection."_
4. **Collection & Scale Receipt:** Attends the collection point. The field agent
   grades and weighs the crop.
5. **Settlement SMS Receipt:** Within 24 hours of delivery acceptance, receives
   an authoritative SMS: _"Payment of GHS 3,214.12 sent to 024XXXX142 for 780kg
   Tomatoes Grade A less GHS 61.88 collection fee."_

#### C. Exceptions & Edge Cases

- **Grade B or Reject at Farm Gate:** If crop fails Grade A criteria, it is
  classified as Grade B (discounted rate) or `Reject`.
  - _Handling:_ Rejected consignments settle to GHS 0.00 and bear **zero
    collection fee**
    ([02-domain-model.md § 6.2](file:///home/gkl/Work/Market-Place/docs/02-domain-model.md#L339-L341)).
    Agent must record an evidentiary photo and provide the farmer with a
    physical reason.
- **Weight Shortfall (`recorded_kg` < `listed_kg`):** Farmer listed 800 kg but
  harvest yielded only 650 kg.
  - _Handling:_ Payout is strictly based on the scale's `recorded_kg`. The app
    recalculates the settlement and fee dynamically; no debt is carried over.
- **Wallet Limit Exceeded (`LIMIT_EXCEEDED`):** Ghanaian MoMo Tier-1 wallets cap
  daily transfers.
  - _Handling:_ The payout engine catches the provider error code. Ops console
    flags the consignment and splits the settlement into two consecutive
    calendar day payouts
    ([03-payments-and-escrow.md § 9.3](file:///home/gkl/Work/Market-Place/docs/03-payments-and-escrow.md#L312-L327)).
- **Wallet Name Mismatch / SIM Swap:**
  - _Handling:_ Payout is halted; funds remain in escrow. An Ops exception task
    is generated. A field ops agent must verify the farmer in person before an
    override is approved
    ([07-security-and-fraud.md § 5.2](file:///home/gkl/Work/Market-Place/docs/07-security-and-fraud.md#L155)).

---

### 2.2 Buyer (Offtaker)

#### A. Account Creation & Onboarding

- Corporate verification via email, business registration documents (for
  commercial buyers in Accra or international importers), password, and
  mandatory SMS/Email OTP (2FA).

#### B. Normal Interaction Flow

1. **Browse Marketplace:** Views aggregated Lots with real farm gate grading
   photos (never stock photos), delivered price per metric tonne (GHS or USD),
   destination, and cold chain temperature history.
2. **Post Standing Requirement (Optional):** If no matching lot exists, posts
   recurring demand (e.g., _"Need 2,000 kg Grade A Tomatoes weekly in Accra at
   <= GHS 5.60/kg"_).
3. **Commit & Fund Escrow:** Taps "Commit and Pay". Funds the full delivered lot
   price via collections PSP (card/bank transfer) directly into the **bank trust
   account** (`escrow_pending` ➔ `escrow_funded`).
4. **Live Cold Chain Tracking:** Monitors 5 domestic milestones (or 10 export
   milestones) with real-time temperature logs and truck location.
5. **Delivery Inspection & Acceptance:** Upon arrival at receiving dock,
   inspects produce and taps **"Accept Delivery"** (or "Dispute").

#### C. Exceptions & Edge Cases

- **Payment Authorization Failure (`DECLINED`):** Card fails or bank transfer
  times out.
  - _Handling:_ Lot immediately rolls back from `escrow_pending` to `listed` so
    other buyers can commit
    ([03-payments-and-escrow.md § 4.2](file:///home/gkl/Work/Market-Place/docs/03-payments-and-escrow.md#L135)).
- **Delivery Rejection & Dispute (`disputed`):** Buyer claims produce is spoiled
  or does not match Grade A standards.
  - _Handling:_ Lot enters `disputed` state. Escrow release is instantly locked.
    Ops compares farm gate photos + transit temperature logs against buyer dock
    photos. If spoilage was caused by truck refrigeration failure, transit cargo
    insurance pays out, refunding buyer escrow and paying farmers
    ([03-payments-and-escrow.md § 9.5](file:///home/gkl/Work/Market-Place/docs/03-payments-and-escrow.md#L339-L355)).
- **Partial Shortfall at Delivery:** Truck arrives with 780 kg instead of 800 kg
  due to natural transit shrinkage.
  - _Handling:_ Buyer accepts delivered kilograms. Escrow releases pro-rata to
    farmers and CryoChain; remaining excess escrow for the missing weight is
    refunded to buyer
    ([03-payments-and-escrow.md § 7.2](file:///home/gkl/Work/Market-Place/docs/03-payments-and-escrow.md#L231-L242)).

---

### 2.3 Field Agent

#### A. Account Provisioning

- Staff account created by Ops. Assigned to hardware device using device binding
  tokens. Re-authentication enforced every 30 days.

#### B. Normal Interaction Flow

1. **Pull Route Data (Morning Sync):** Before heading to rural areas, pulls
   today's assigned `Route`, `Stops`, and expected farmer `Consignments`.
2. **Offline-First Operation:** Operates in zero-connectivity environments for
   8+ hours
   ([05-offline-and-sync.md](file:///home/gkl/Work/Market-Place/docs/05-offline-and-sync.md)).
3. **Weigh, Grade & Photograph at Stop:**
   - Places crates on certified digital scales; enters `recorded_kg`.
   - Assigns Grade (`A`, `B`, `Reject`).
   - **Mandatory Evidentiary Photo:** Takes a real-time photograph of the
     produce on the scale (compressed on-device < 200 KB).
   - Reads the calculated settlement out loud to the farmer.
4. **Confirm Stop & Lot Lock:** Once all expected farmers at the stop are
   captured, taps "Confirm Lot".

#### C. Exceptions & Edge Cases

- **Unlisted Farmer Shows Up at Stop:** An unregistered farmer arrives with 200
  kg of produce.
  - _Handling:_ Agent creates a provisional farmer record and ad-hoc consignment
    offline using client-generated UUIDv7 keys
    ([02-domain-model.md § 3](file:///home/gkl/Work/Market-Place/docs/02-domain-model.md#L216-L221)).
- **Confirm Button Locked (Invariant I5):** Agent cannot tap "Confirm Lot".
  - _Handling:_ The UI prevents confirmation if any farmer assigned to the stop
    is uncaptured, or if buyer escrow is not yet confirmed funded
    (`escrow_funded`).
- **Photo Reuse Prevention (Fraud X6):**
  - _Handling:_ The device attaches hardware camera timestamps and GPS
    coordinates. On sync, backend runs perceptual hash checking across image
    archives to block duplicate photo uploads
    ([07-security-and-fraud.md § 5.2](file:///home/gkl/Work/Market-Place/docs/07-security-and-fraud.md#L150)).

---

### 2.4 Driver

#### A. Account Provisioning & Device Setup

- Bound Android smartphone mounted on dashboard. Ultra-thin UI with 4 primary
  screens and extra-large 64dp touch targets
  ([04-role-specifications.md § 5.3](file:///home/gkl/Work/Market-Place/docs/04-role-specifications.md#L210)).

#### B. Normal Interaction Flow

1. **Manifest Review:** Views sequence of collection stops, map waypoints, and
   aggregate tonnage.
2. **Arrive at Stop & Temperature Check Gate:**
   - Taps "Arrived at Stop".
   - Checks truck reefer unit and logs temperature (e.g. `4.0°C`).
   - **Hard Gate:** The "Depart Stop" button remains strictly disabled until an
     in-range temperature reading is recorded
     ([04-role-specifications.md § 5.3](file:///home/gkl/Work/Market-Place/docs/04-role-specifications.md#L211-L213)).
3. **Transit Telematics:** App automatically logs background GPS coordinates
   every 5 minutes while in transit.
4. **Proof of Delivery (POD):**
   - Arrives at buyer warehouse.
   - Takes delivery dock photo of unloaded crates.
   - Enters the name of the receiving dock manager. Taps "Confirm Delivery".

#### C. Exceptions & Edge Cases

- **Refrigeration Failure in Transit (Cold Chain Breach):**
  - _Handling:_ Driver taps the emergency **"Exception"** button (accessible
    within 1 tap from any screen). Logs emergency alert: _"Reefer unit fault:
    Temp rising above 8°C"_. Alert pings Ops console immediately to reroute
    truck to nearest cold hub.
- **Dock Refusal / Buyer Absent:**
  - _Handling:_ Driver logs exception. Stop timer triggers Ops intervention.
    Driver cannot leave without dock manager signoff or Ops remote release.

---

### 2.5 Operations & Finance (Ops)

#### A. Environment & Access

- **Desktop Console Only:** Retool/Appsmith web portal
  ([ADR 0009](file:///home/gkl/Work/Market-Place/docs/adr/0009-ops-console-low-code.md)).
  Single Sign-On (SSO) with **mandatory hardware security keys
  (FIDO2/WebAuthn)**.

#### B. Normal Interaction Flow

1. **Lot Assembly & Route Dispatch:** Aggregates farmer consignments into
   commercial lots and dispatches routes.
2. **Escrow Ledger Monitoring:** Verifies collections arriving in the bank trust
   account.
3. **Two-Step Escrow Release Control:**
   - Step 1: Initiated by Ops Lead once buyer marks "Accepted".
   - Step 2: Second-factor confirmation by Finance (enforcing Segregation of
     Duties for lots above threshold Q9)
     ([07-security-and-fraud.md § 4](file:///home/gkl/Work/Market-Place/docs/07-security-and-fraud.md#L104-L118)).
4. **Bulk MoMo Payout Disbursement:** Executes API payout batch to farmer
   wallets within 24 hours.
5. **Daily 3-Way Reconciliation:** Reconciles Bank Trust Statement vs. PSP Logs
   vs. Shadow Ledger
   ([03-payments-and-escrow.md § 7.3](file:///home/gkl/Work/Market-Place/docs/03-payments-and-escrow.md#L243-L258)).

---

## 3. Automated Matching, Lot Creation & Route Optimization

To eliminate manual bottlenecks, the backend engine executes continuous
aggregation, demand matching, and route optimization routines.

```
                    INGESTION & AGGREGATION PIPELINE
                    
Farmer Consignments                  Buyer Standing Requirements
(Location, Crop, Qty, Ready Date)   (Target Crop, Weekly Qty, Max Price, Dock)
           │                                              │
           └──────────────────────┬───────────────────────┘
                                  │
                                  ▼
                   ┌─────────────────────────────┐
                   │ 1. AUTO-MATCHING ENGINE     │
                   │    Constraint Satisfaction  │
                   └──────────────┬──────────────┘
                                  │
                                  ▼
                   ┌─────────────────────────────┐
                   │ 2. AUTO-LOT GENERATOR       │
                   │    Cluster by Corridor & Qty│
                   │    Enforce Stop Value Rule  │
                   └──────────────┬──────────────┘
                                  │
                                  ▼
                   ┌─────────────────────────────┐
                   │ 3. ROUTE & STOP OPTIMIZER   │
                   │    Vehicle Capacity Fitting │
                   │    Time-Window Sequencing   │
                   └─────────────────────────────┘
```

### 3.1 Automated Requirement Matching Engine

Buyers specify ongoing supply contracts via `StandingRequirement` entities
([02-domain-model.md § 2.8](file:///home/gkl/Work/Market-Place/docs/02-domain-model.md#L184-L213)):

```typescript
interface StandingRequirement {
    id: string;
    offtaker_id: string;
    crop: "tomatoes" | "peppers" | "onions" | "mango";
    target_grade: "A" | "B";
    quantity_kg_per_period: number; // e.g. 2000 kg
    period: "daily" | "weekly";
    max_delivered_price_minor: bigint; // Max GHS buyer will pay
    destination_hub: string; // e.g. "Accra Central Wholesale"
    window_start: string; // ISO Date
    window_end: string;
    state: "open" | "matched" | "expired";
}
```

#### Matching Logic:

1. **Query Active Pool:** Every morning at 04:00 GMT, the system queries
   unallocated consignments in status `listed` where
   `harvest_ready_date <= CURRENT_DATE + 1`.
2. **Cluster by Crop & Region:** Groups available tonnage by geographic district
   (e.g. Eastern Region: Asikuma, Kpeve, Anum).
3. **Match Against Open Requirements:**
   - Matches when
     `SUM(consignments.listed_kg) >= requirement.quantity_kg_per_period * 0.95`.
   - Matches when estimated delivered cost (Farm Gate Price + Transport +
     Spread) `< requirement.max_delivered_price_minor`.
4. **Trigger Auto-Commit Prompt:** Sends an instant priority notification to the
   buyer: _"A matched lot of 2,000 kg Grade A Tomatoes is ready for pickup on 14
   Oct. Review & Fund Escrow."_

---

### 3.2 Automated Lot Assembly Engine

Lots are not created arbitrarily; they are governed by unit economics to ensure
CryoChain does not run loss-making collection routes
([14-metrics-and-unit-economics.md § 3](file:///home/gkl/Work/Market-Place/docs/14-metrics-and-unit-economics.md#L41-L96)).

#### Algorithmic Invariants:

1. **The Stop Value Threshold Rule:**
   - CryoChain incurs a marginal cost of **GHS 310 (USD 25)** per collection
     stop.
   - The collection fee deducted from farmers is capped at **5% of gross
     value**.
   - Therefore, **Minimum Stop Value = GHS 310 / 0.05 = GHS 6,200**.
   - _Rule:_ A collection stop must aggregate at least **GHS 6,200** of produce
     (approx. 1,475 kg of tomatoes at GHS 4.20/kg) to achieve 100% collection
     fee recovery.
2. **Lot Sizing Constraint:**
   - Standard vehicle capacity = **3.0 Metric Tonnes (3,000 kg)**.
   - Auto-Lot Generator clusters 2 to 3 stops along a single geographic corridor
     to achieve between **2,700 kg and 3,000 kg** per lot.

```sql
-- Conceptual aggregation query for auto-building a 3-tonne lot
WITH candidate_stops AS (
  SELECT 
    collection_point_id,
    SUM(listed_kg) as total_kg,
    SUM(listed_kg * price_minor / 100) as gross_stop_value
  FROM consignments
  WHERE lot_id IS NULL AND state = 'listed'
  GROUP BY collection_point_id
  HAVING SUM(listed_kg * price_minor / 100) >= 6200 -- Threshold check
)
SELECT * FROM candidate_stops
ORDER BY total_kg DESC;
```

---

### 3.3 Route and Stop Optimizer with Time Windows

Produce spoilage accelerates rapidly under equatorial midday heat. Therefore,
routes enforce strict operational time windows.

#### Time Window Schedule (Standard Collection Day):

| Window            | Phase                   | Actors         | Operational Requirement                                                      |
| ----------------- | ----------------------- | -------------- | ---------------------------------------------------------------------------- |
| **05:30 – 07:30** | Farm Gate Staging       | Farmers        | Harvested crops staged at designated shade collection points.                |
| **06:30 – 08:30** | Pre-Cooling & Transit   | Driver         | Truck reefer pre-cooled to **4.0°C** before departure from depot.            |
| **07:30 – 09:30** | Weigh & Grading Window  | Field Agent    | Agent weighs and grades all consignments on certified digital scales.        |
| **09:30 – 10:30** | Custody Handoff Window  | Driver & Agent | Load transferred to vehicle. **Temperature logged**. Departure stamped.      |
| **10:30 – 13:30** | Cold Trunk Transit      | Driver         | Continuous transit along highway corridor. Background GPS every 5 min.       |
| **13:30 – 15:00** | Receiving & Dock Window | Driver & Buyer | Arrival at buyer warehouse, Proof of Delivery (POD) photo, buyer acceptance. |
| **15:00 – 16:30** | Financial Settlement    | Ops & System   | Escrow released; Mobile Money payout batch triggered to farmers.             |

#### Routing Constraints:

1. **Single-Lot Stop Exclusivity:** Every Stop assigned to a route belongs to
   **exactly one Lot**
   ([02-domain-model.md § 2.6](file:///home/gkl/Work/Market-Place/docs/02-domain-model.md#L151-L158)).
2. **Corridor Optimization:** Stops are ordered sequentially by highway
   progression (e.g. Stop 1: Asikuma Junction ➔ Stop 2: Kpeve Crossroads ➔
   Highway N2 to Accra) to minimize vehicle turnaround time.
3. **Maximum Truck Dwell Time:** No stop may exceed **45 minutes** of vehicle
   idle time to prevent internal box temperature drift.

---

## 4. Operational Invariants Checklist

The software and database enforce these binding constraints across every
transaction:

- [ ] **I1: No Phantom Lots.** A Lot cannot be listed without real farmer
      consignments backing it
      ([ADR 0011](file:///home/gkl/Work/Market-Place/docs/adr/0011-lots-are-aggregations-not-forward-sales.md)).
- [ ] **I2: Escrow Before Dispatch.** Field agent "Confirm Lot" control remains
      locked until buyer payment confirms `escrow_funded` in the trust account
      ([02-domain-model.md § 4.1](file:///home/gkl/Work/Market-Place/docs/02-domain-model.md#L248-L250)).
- [ ] **I3: No Payout Without Acceptance.** Escrow release buttons are disabled
      in the Ops console until buyer has marked "Accepted"
      ([02-domain-model.md § 4.3](file:///home/gkl/Work/Market-Place/docs/02-domain-model.md#L287-L288)).
- [ ] **I4: No Departure Without Temperature.** Driver cannot depart any
      collection stop without logging a compliant temperature
      ([04-role-specifications.md § 5.3](file:///home/gkl/Work/Market-Place/docs/04-role-specifications.md#L211-L213)).
- [ ] **I5: Per-Consignment Integrity.** Payouts and fees are calculated per
      individual farmer consignment, never pooled to a community coordinator or
      stop
      ([02-domain-model.md § 1](file:///home/gkl/Work/Market-Place/docs/02-domain-model.md#L11-L19)).
- [ ] **I6: Segregation of Duties.** The ops user who dispatched a route cannot
      be the same user who approves escrow release for that lot above the value
      threshold
      ([07-security-and-fraud.md § 4](file:///home/gkl/Work/Market-Place/docs/07-security-and-fraud.md#L104-L118)).
