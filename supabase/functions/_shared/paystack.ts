import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export { validSignature } from './signature.ts';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/** Client acting as the calling user (their JWT), so RLS applies. */
export const asCaller = (req: Request) =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

export async function paystack(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}`, 'Content-Type': 'application/json' },
  });
  return (await res.json().catch(() => ({ status: false, message: 'Bad response from Paystack.' }))) as {
    status: boolean;
    message: string;
    data?: any;
  };
}

/** Applies a /transaction/verify result (or a webhook charge.success payload) to our payment row. */
export async function applyTransaction(tx: { reference: string; status: string; amount: number; currency: string; channel?: string; gateway_response?: string }) {
  const db = admin();
  if (tx.status === 'success') {
    const { error } = await db.rpc('settle_paystack_payment', {
      p_reference: tx.reference, p_paid_pesewas: tx.amount, p_currency: tx.currency, p_channel: tx.channel ?? null,
    });
    if (error) throw new Error(error.message);
  } else if (tx.status === 'failed' || tx.status === 'abandoned') {
    await db.rpc('fail_paystack_payment', { p_reference: tx.reference, p_status: tx.status, p_message: tx.gateway_response ?? '' });
  }
}
