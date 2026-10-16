// Callback fallback: after Paystack redirects the buyer back, the app asks us to verify the reference directly,
// so the order updates even if the webhook is late. The webhook stays the primary confirmation path.
import { admin, applyTransaction, asCaller, cors, json, paystack } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { data: who } = await asCaller(req).auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);

  const { reference } = await req.json().catch(() => ({}));
  if (typeof reference !== 'string' || !reference) return json({ error: 'Missing reference.' }, 400);

  // Only the buyer who owns the order may trigger verification of its payment.
  const { data: pay } = await asCaller(req).from('payments').select('reference').eq('reference', reference).maybeSingle();
  if (!pay) return json({ error: 'Payment not found.' }, 404);

  const res = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (!res.status || !res.data) return json({ error: 'Could not verify the payment yet.' }, 502);
  await applyTransaction(res.data);
  const { data: after } = await admin().from('payments').select('status').eq('reference', reference).single();
  return json({ status: after?.status });
});
