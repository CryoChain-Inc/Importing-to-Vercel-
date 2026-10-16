// Buyer starts (or retries) an online payment for one of their unpaid orders. Returns the Paystack checkout URL.
import { admin, applyTransaction, asCaller, cors, json, paystack } from '../_shared/paystack.ts';

const PENDING_TTL_MS = 30 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!Deno.env.get('PAYSTACK_SECRET_KEY')) return json({ error: 'Online payment is not set up yet (missing PAYSTACK_SECRET_KEY).' }, 503);

  const caller = asCaller(req);
  const { data: who } = await caller.auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);

  const { order_id } = await req.json().catch(() => ({}));
  // Own-order check rides on RLS (orders_select_own); buyers row gives the contact email.
  const { data: order } = await caller.from('orders').select('id, code, amount, state, buyer_id').eq('id', order_id ?? '').maybeSingle();
  if (!order || order.buyer_id !== who.user.id) return json({ error: 'Order not found.' }, 404);
  if (order.state !== 'awaiting_payment') return json({ error: 'This order is not awaiting payment.' }, 409);

  const db = admin();
  // Idempotency: one live attempt per order (unique partial index). Reuse it rather than open a second chargeable checkout.
  const findPending = () =>
    db.from('payments').select('reference, authorization_url, created_at').eq('order_id', order.id).eq('status', 'pending').maybeSingle();
  const reuse = async () => {
    const { data: live } = await findPending();
    if (!live) return null;
    if (Date.now() - new Date(live.created_at).getTime() < PENDING_TTL_MS) {
      return live.authorization_url
        ? json({ url: live.authorization_url, reference: live.reference })
        : json({ error: 'A payment is already being started. Try again in a moment.' }, 409);
    }
    // Stale: ask Paystack what happened before opening a new attempt, so a paid-but-unconfirmed charge isn't doubled.
    const res = await paystack(`/transaction/verify/${encodeURIComponent(live.reference)}`);
    if (res.status && res.data) {
      await applyTransaction(res.data);
      if (res.data.status === 'success') return json({ error: 'This order is already paid.' }, 409);
    }
    await db.rpc('fail_paystack_payment', { p_reference: live.reference, p_status: 'abandoned', p_message: 'superseded' });
    return null;
  };
  const existing = await reuse();
  if (existing) return existing;

  const { data: buyer } = await caller.from('buyers').select('email').eq('id', who.user.id).maybeSingle();
  const reference = `${order.code}-${crypto.randomUUID().slice(0, 8)}`;
  const pesewas = Math.round(Number(order.amount) * 100);

  const { error: insertError } = await db.from('payments').insert({ order_id: order.id, reference, amount_pesewas: pesewas });
  if (insertError) {
    // 23505 = a concurrent request won the race for the single pending slot.
    if (insertError.code === '23505') return (await reuse()) ?? json({ error: 'Could not start the payment.' }, 409);
    return json({ error: 'Could not start the payment.' }, 500);
  }

  const appUrl = Deno.env.get('APP_URL') ?? '';
  const res = await paystack('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      reference,
      amount: pesewas,
      currency: 'GHS',
      // Paystack requires an email; buyers who signed up by phone get a stable placeholder.
      email: buyer?.email || who.user.email || `${who.user.id}@pay.cryochain.app`,
      // No `channels`: Paystack shows every method enabled on the account (mobile money, bank, card).
      ...(appUrl ? { callback_url: appUrl } : {}),
      metadata: { order_id: order.id, order_code: order.code },
    }),
  });
  if (!res.status || !res.data?.authorization_url) {
    await db.rpc('fail_paystack_payment', { p_reference: reference, p_status: 'failed', p_message: res.message });
    console.error('paystack initialize failed', res.message);
    return json({ error: `Paystack: ${res.message || 'could not start the payment.'}` }, 502);
  }
  await db.from('payments').update({ authorization_url: res.data.authorization_url }).eq('reference', reference);
  return json({ url: res.data.authorization_url, reference });
});
