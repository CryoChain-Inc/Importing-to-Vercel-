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

/** Applies a Paystack result to a lot payment, or to a truck booking when the reference starts with TRK. */
export async function applyTransaction(tx: { reference: string; status: string; amount: number; currency: string; channel?: string; gateway_response?: string }) {
  const db = admin();
  const truck = tx.reference.startsWith('TRK');
  const settle = truck ? 'settle_truck_payment' : 'settle_paystack_payment';
  const fail = truck ? 'fail_truck_payment' : 'fail_paystack_payment';
  if (tx.status === 'success') {
    const { error } = await db.rpc(settle, {
      p_reference: tx.reference, p_paid_pesewas: tx.amount, p_currency: tx.currency, p_channel: tx.channel ?? null,
    });
    if (error) throw new Error(error.message);
  } else if (tx.status === 'failed' || tx.status === 'abandoned') {
    await db.rpc(fail, { p_reference: tx.reference, p_status: tx.status, p_message: tx.gateway_response ?? '' });
  }
}

export const MOMO_BANK: Record<string, string> = { 'MTN MoMo': 'MTN', 'Telecel Cash': 'VOD', 'AirtelTigo Money': 'ATL' };

/** 233XXXXXXXXX / 0XXXXXXXXX / XXXXXXXXX -> 0XXXXXXXXX, the form Paystack wants for Ghana MoMo. */
export function localMsisdn(number: unknown) {
  const d = String(number ?? '').replace(/\D/g, '');
  return d.startsWith('233') ? `0${d.slice(3)}` : d.startsWith('0') ? d : `0${d}`;
}

/** Applies a transfer.success / transfer.failed / transfer.reversed webhook to our transfer row (matched by reference). */
export async function applyTransferEvent(event: string, data: { reference: string; transfer_code?: string; reason?: string }) {
  const status = event === 'transfer.success' ? 'succeeded' : 'failed';
  const db = admin();
  const { data: t } = await db.from('payout_transfers').select('id').eq('reference', data.reference).maybeSingle();
  if (!t) return;
  const { error } = await db.rpc('apply_transfer_result', {
    p_transfer: t.id, p_status: status, p_provider_ref: data.transfer_code ?? null,
    p_error: status === 'failed' ? `Paystack: ${event.replace('transfer.', '')}${data.reason ? ` (${data.reason})` : ''}` : null,
  });
  if (error) throw new Error(error.message);
}
