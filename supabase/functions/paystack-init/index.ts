// Buyer starts (or retries) an online payment for one of their unpaid orders. Returns the Paystack checkout URL.
import { admin, asCaller, cors, json, paystack } from '../_shared/paystack.ts';

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

  const { data: buyer } = await caller.from('buyers').select('email').eq('id', who.user.id).maybeSingle();
  const reference = `${order.code}-${crypto.randomUUID().slice(0, 8)}`;
  const pesewas = Math.round(Number(order.amount) * 100);

  const db = admin();
  const { error: insertError } = await db.from('payments').insert({ order_id: order.id, reference, amount_pesewas: pesewas });
  if (insertError) return json({ error: 'Could not start the payment.' }, 500);

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
  return json({ url: res.data.authorization_url, reference });
});
