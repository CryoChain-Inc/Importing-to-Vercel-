# Spec: refunds

Module `refunds` from `CAPABILITY-MAP.md`. Branch: `fea/refunds` (off `fea/shortfall`).

## Objective

A buyer gets money back for the part of an order that could not be supplied, after a person in ops approves it.

## Behaviour

1. **Request.** When an order's short quantity changes (`order_items.short_kg`, set by `shortfall`), one refund request
   per order is created or updated: short quantity × the price the buyer paid, less anything already refunded or in flight.
2. **Approval.** Ops see requests on the "Buyer refunds" page. "Approve and refund" needs a second confirming tap.
   Nothing reaches Paystack without it. Ops can also reject with a note.
3. **Sending.** The `refund-order` edge function claims the refund atomically (a double tap cannot send twice) and
   calls Paystack `POST /refund` with the original payment's reference, the amount in pesewas and currency GHS.
4. **Result.** Paystack's `refund.processed` webhook marks it refunded and tells the buyer; `refund.failed` and
   `refund.needs-attention` mark it failed with the reason, and ops can approve again.
5. **Bank-transfer orders.** No Paystack payment exists, so ops pay it back by hand and record it with a note.
6. **Buyer view.** The order shows the refund amount and whether it is being processed or refunded.

Statuses: `requested → sending → sent → refunded | failed`; `failed → sending` on re-approval; `rejected` and `refunded` are final.

## Not confirmed against Paystack

Paystack's documentation site refused automated reading. From Paystack's public GitHub API spec: the endpoint, that
`transaction` takes the payment reference, and the webhook fields `transaction_reference`, `refund_reference`,
`status` are confirmed. Not confirmed: that `amount` is in pesewas (assumed, as for charges and transfers), and the
`refund.processed` event name. **Run one refund in Paystack test mode before using this with real money.**

## Not in this module

- Refunds for anything other than short supply (cancelled paid orders, quality disputes, the "orphaned" payment state).
- A second-person approval threshold.
- Truck-booking refunds.

## Structure

- `supabase/migrations/20261114090000_refunds.sql`: `refunds` table, request trigger, `claim_refund`,
  `apply_refund_result`, `mark_refund_done`, `reject_refund`.
- `supabase/functions/refund-order/`, webhook handling in `_shared/paystack.ts` and `paystack-webhook/`.
- `src/services/ops.refunds.service.ts`, `src/features/ops/components/RefundsPanel.tsx`, buyer order line in `Orders.tsx`.

## Testing

- pgTAP `supabase/tests/refunds.test.sql`: request amount, one request per order, ops-only approval, no double
  approval, failure and retry, refunded is final, only the difference after a later shortage, hand refunds, buyer visibility.
- Jest `ops.refunds.service.test.ts`.
- Manual: one refund end to end in Paystack test mode.

## Success Criteria

- [ ] 20 kg short at GH₵ 12 creates a GH₵ 240 request that ops can see.
- [ ] Approving sends exactly that amount against the original payment; approving twice sends once.
- [ ] The webhook marks it refunded and the buyer sees "Refunded".
- [ ] A failed refund shows the reason and can be approved again.
- [ ] A bank-transfer order can only be recorded as paid by hand.
