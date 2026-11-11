// Sends an approved buyer refund to Paystack. Ops only: calling this IS the approval.
//   { refundId }  approve a requested (or previously failed) refund and ask Paystack to refund the original payment
// Money state only changes through claim_refund / apply_refund_result, the same path the webhook uses.
import { admin, asCaller, cors, json, paystack } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { data: who } = await asCaller(req).auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);
  const db = admin();
  const { data: me } = await db.from('profiles').select('role').eq('id', who.user.id).single();
  if (me?.role !== 'ops') return json({ error: 'Ops only.' }, 403);
  if (!Deno.env.get('PAYSTACK_SECRET_KEY')) return json({ error: 'PAYSTACK_SECRET_KEY is not set.' }, 503);

  const body = await req.json().catch(() => ({}));
  const refundId = String(body.refundId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(refundId)) return json({ error: 'Invalid refund.' }, 400);

  // Atomic: only one caller can move a refund to "sending", so a double click cannot refund twice.
  const { data: claimed, error: claimError } = await db.rpc('claim_refund', { p_id: refundId, p_by: who.user.id });
  if (claimError) {
    const m = claimError.message;
    return json({
      error: m.includes('no online payment') ? 'This order was not paid online. Refund it by hand, then mark it refunded.'
        : m.includes('more than was paid') ? 'The refund is more than the buyer paid.'
        : 'This refund is not waiting for approval.',
    }, 409);
  }
  const r = (Array.isArray(claimed) ? claimed[0] : claimed) as { refund_id: string; reference: string; amount_pesewas: number; reason: string };

  // Amounts go to Paystack in pesewas, as they do for charges and transfers.
  const res = await paystack('/refund', {
    method: 'POST',
    body: JSON.stringify({ transaction: r.reference, amount: r.amount_pesewas, currency: 'GHS', merchant_note: r.reason.slice(0, 200) }),
  });
  if (!res.status) {
    await db.rpc('apply_refund_result', { p_id: r.refund_id, p_status: 'failed', p_provider_ref: null, p_error: res.message });
    return json({ error: `Paystack did not accept the refund: ${res.message}` }, 502);
  }
  const done = res.data?.status === 'processed';
  await db.rpc('apply_refund_result', {
    p_id: r.refund_id, p_status: done ? 'refunded' : 'sent', p_provider_ref: res.data?.id != null ? String(res.data.id) : null, p_error: null,
  });
  return json({ status: done ? 'refunded' : 'sent' });
});
