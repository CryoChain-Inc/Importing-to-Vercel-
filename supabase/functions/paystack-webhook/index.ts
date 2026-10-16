// Paystack -> us. Deployed with verify_jwt = false (see config.toml); authenticity comes from the HMAC signature.
import { applyTransaction, validSignature } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get('x-paystack-signature'), Deno.env.get('PAYSTACK_SECRET_KEY') ?? ''))) {
    return new Response('Invalid signature', { status: 401 });
  }
  try {
    const event = JSON.parse(raw) as { event: string; data: any };
    if (event.event === 'charge.success') await applyTransaction(event.data);
  } catch (e) {
    console.error('paystack-webhook', e);
    return new Response('error', { status: 500 }); // non-2xx makes Paystack retry
  }
  return new Response('ok');
});
