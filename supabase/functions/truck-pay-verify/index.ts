// After Paystack sends the buyer back, confirm a cold-truck payment. Never reads lot payments.
import { admin, applyTransaction, asCaller, cors, json, paystack } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const caller = asCaller(req);
  const { data: who } = await caller.auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);

  const { reference } = await req.json().catch(() => ({}));
  if (typeof reference !== 'string' || !reference.startsWith('TRK')) return json({ error: 'Missing booking reference.' }, 400);

  const { data: pay } = await caller.from('truck_payments').select('reference').eq('reference', reference).maybeSingle();
  if (!pay) return json({ error: 'Booking payment not found.' }, 404);

  const res = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (!res.status || !res.data) return json({ error: 'Could not verify the payment yet.' }, 502);
  await applyTransaction(res.data);
  const { data: after } = await admin().from('truck_payments').select('status').eq('reference', reference).single();
  return json({ status: after?.status });
});
