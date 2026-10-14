# CryoChain Implementation TODO

A simple, prioritized checklist for the **Farmer** and **Ops** modules.

---

## 🌾 Farmer App

### 1. Daily Prices & Market Info
- [x] Public daily price board with grade tiers (Grade A / B)
- [ ] Historical price trends & market updates
- [ ] Crop quality standards guide

### 2. Produce Listing (Consignments)
- [ ] Create new consignment (select crop, estimated weight in kg, harvest date)
- [ ] Select preferred pickup location / collection point
- [ ] Provisional payout estimate preview (e.g., GHS per kg calculation)
- [ ] Edit / Cancel draft listings before agent pickup

### 3. Collection & Deliveries
- [ ] Active consignment tracking (Pending Pickup -> Collected -> Delivered)
- [ ] Scale receipt viewing (actual weighed kg, recorded grade, agent signature)
- [ ] Rejection / Grade B markdown notification handling

### 4. Wallet & Payments
- [ ] Mobile Money (MoMo) wallet setup & verification status
- [ ] Payment settlement history & receipts
- [ ] SMS receipt logs

---

## ⚙️ Operations & Finance (Ops)

### 1. Consignment & Intake Review
- [ ] Real-time intake feed across collection points
- [ ] Inspect agent-submitted weights and grading logs
- [ ] Exception handling (disputed weights, rejected crops, damaged stock)

### 2. Lot Assembly & Route Dispatch
- [ ] Auto-group farmer consignments into commercial buyer lots
- [ ] Assign lots to available cold-chain drivers & vehicles
- [ ] Track dispatch schedules and delivery time windows

### 3. Escrow & Payments
- [ ] Monitor buyer escrow funding before dispatch approval
- [ ] Two-step escrow release control (Ops lead approval + Finance clearance)
- [ ] Trigger batch Mobile Money payouts to farmers

### 4. Reconciliation & Reporting
- [ ] Daily 3-way reconciliation (Bank Escrow vs. PSP Logs vs. Internal Ledger)
- [ ] Node capacity & daily throughput dashboard
- [ ] Export summary reports for audit and operations
