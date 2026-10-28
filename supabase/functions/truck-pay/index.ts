// Buyer starts (or retries) Paystack checkout for one cold-truck booking.
// This function never reads orders or lot payments.
import { admin, applyTransaction, asCaller, cors, json, paystack } from '../_shared/paystack.ts';

const PENDING_TTL_MS = 30 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!Deno.env.get('PAYSTACK_SECRET_KEY')) return json({ error: 'Online payment is not set up yet (missing PAYSTACK_SECRET_KEY).' }, 503);

  const caller = asCaller(req);
  const { data: who } = await caller.auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);

  const { booking_id, native } = await req.json().catch(() => ({}));
  const { data: booking } = await caller.from('truck_bookings').select('id, code, amount, state, buyer_id').eq('id', booking_id ?? '').maybeSingle();
  if (!booking || booking.buyer_id !== who.user.id) return json({ error: 'Booking not found.' }, 404);
  if (booking.state !== 'awaiting_payment') return json({ error: 'This booking is not awaiting payment.' }, 409);

  const db = admin();
  const findPending = () =>
    db.from('truck_payments').select('reference, authorization_url, created_at').eq('booking_id', booking.id).eq('status', 'pending').maybeSingle();
  const reuse = async () => {
    const { data: live } = await findPending();
    if (!live) return null;
    if (Date.now() - new Date(live.created_at).getTime() < PENDING_TTL_MS) {
      return live.authorization_url
        ? json({ url: live.authorization_url, reference: live.reference })
        : json({ error: 'A payment is already being started. Try again in a moment.' }, 409);
    }
    const res = await paystack(`/transaction/verify/${encodeURIComponent(live.reference)}`);
    if (res.status && res.data) {
      await applyTransaction(res.data);
      if (res.data.status === 'success') return json({ error: 'This booking is already paid.' }, 409);
    }
    await db.rpc('fail_truck_payment', { p_reference: live.reference, p_status: 'abandoned', p_message: 'superseded' });
    return null;
  };
  const existing = await reuse();
  if (existing) return existing;

  const { data: profile } = await caller.from('profiles').select('email').eq('id', who.user.id).maybeSingle();
  const reference = `${booking.code}-${crypto.randomUUID().slice(0, 8)}`;
  const pesewas = Math.round(Number(booking.amount) * 100);
  const { error: insertError } = await db.from('truck_payments').insert({ booking_id: booking.id, reference, amount_pesewas: pesewas });
  if (insertError) {
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
      email: profile?.email || who.user.email || `${who.user.id}@pay.cryochain.app`,
      // The app opens checkout in an auth session that closes when Paystack redirects to its own URL scheme.
      ...(native === true ? { callback_url: 'cryochain://payment/verify' } : appUrl ? { callback_url: `${appUrl.replace(/\/$/, '')}/payment/verify` } : {}),
      metadata: { booking_id: booking.id, booking_code: booking.code },
    }),
  });
  if (!res.status || !res.data?.authorization_url) {
    await db.rpc('fail_truck_payment', { p_reference: reference, p_status: 'failed', p_message: res.message });
    console.error('truck-pay initialize failed', res.message);
    return json({ error: `Paystack: ${res.message || 'could not start the payment.'}` }, 502);
  }
  await db.from('truck_payments').update({ authorization_url: res.data.authorization_url }).eq('reference', reference);
  return json({ url: res.data.authorization_url, reference });
});
