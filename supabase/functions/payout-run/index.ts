// Farmer payouts through Paystack. Ops only.
//   { op: 'preflight', runId }   wallet name lookups + Paystack balance; required before release
//   { op: 'release', runId }     after approval (if the run needs one): submit every queued transfer
//   { op: 'send', transferId }   retry one failed (or still queued) transfer
//   { op: 'verify', transferId } ask Paystack where one transfer stands
// Money state is only ever changed through apply_transfer_result, the same path the webhook uses.
import { admin, asCaller, cors, json, localMsisdn, MOMO_BANK, paystack } from '../_shared/paystack.ts';

const db = admin();
const pesewas = (ghs: number) => Math.round(ghs * 100);
const apply = (id: string, status: string, ref: string | null, error: string | null) =>
  db.rpc('apply_transfer_result', { p_transfer: id, p_status: status, p_provider_ref: ref, p_error: error });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { data: who } = await asCaller(req).auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);
  const { data: me } = await db.from('profiles').select('role').eq('id', who.user.id).single();
  if (me?.role !== 'ops') return json({ error: 'Ops only.' }, 403);
  if (!Deno.env.get('PAYSTACK_SECRET_KEY')) return json({ error: 'PAYSTACK_SECRET_KEY is not set.' }, 503);

  const body = await req.json().catch(() => ({}));
  try {
    if (body.op === 'preflight') return await preflight(String(body.runId));
    if (body.op === 'release') return await release(String(body.runId));
    if (body.op === 'send') return await sendById(String(body.transferId));
    if (body.op === 'verify') return await verify(String(body.transferId));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Payout failed.' }, 500);
  }
  return json({ error: 'Unknown op.' }, 400);
});

async function preflight(runId: string) {
  const { data: run } = await db.from('payout_runs').select('status').eq('id', runId).single();
  if (run?.status !== 'review') return json({ error: 'Only a run under review can be checked.' }, 409);
  const { data: transfers } = await db.from('payout_transfers').select('*').eq('run_id', runId).eq('status', 'queued');

  // Wallet name lookup is advisory (Paystack test mode cannot resolve real wallets): it is recorded, not blocking.
  await Promise.all((transfers ?? []).map(async (t) => {
    const res = await paystack(`/bank/resolve?account_number=${localMsisdn(t.momo_number)}&bank_code=${MOMO_BANK[t.network]}`);
    const name = res.status ? res.data?.account_name : null;
    await db.from('payout_transfers').update({ wallet_check: name ? 'verified' : 'unverified', wallet_registered_name: name ?? null }).eq('id', t.id);
    if (name) await db.from('farmers').update({ wallet_verified_at: new Date().toISOString() }).eq('id', t.farmer_id);
  }));

  const needed = (transfers ?? []).reduce((n, t) => n + pesewas(Number(t.amount)), 0);
  const bal = await paystack('/balance');
  const ghs = (bal.data as { currency: string; balance: number }[] | undefined)?.find((b) => b.currency === 'GHS');
  const test = (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').startsWith('sk_test_');
  const balanceOk = test || (!!ghs && ghs.balance >= needed); // test balances are not meaningful
  const result = { balance: ghs ? ghs.balance / 100 : null, needed: needed / 100, balanceOk, test };
  await db.from('payout_runs').update({ preflight: result, preflight_at: balanceOk ? new Date().toISOString() : null }).eq('id', runId);
  return json(result);
}

async function release(runId: string) {
  // One atomic gate: reviewed, preflight passed, and approved when the run needs a second person.
  const { data: gate } = await db.from('payout_runs')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', runId).eq('status', 'review').not('preflight_at', 'is', null)
    .or('needs_approval.eq.false,approved_by.not.is.null')
    .select('id').maybeSingle();
  if (!gate) return json({ error: 'Run the preflight checks and get approval (if needed) before releasing funds.' }, 409);

  const { data: transfers } = await db.from('payout_transfers').select('id').eq('run_id', runId).eq('status', 'queued');
  for (const t of transfers ?? []) await send(t.id);
  return json({ ok: true });
}

async function sendById(id: string) {
  const { data: t } = await db.from('payout_transfers').select('status, payout_runs(status)').eq('id', id).single();
  const run = (t as { payout_runs: { status: string } } | null)?.payout_runs;
  if (!t || !['released', 'partial'].includes(run?.status ?? '') || !['queued', 'failed'].includes(t.status)) {
    return json({ error: 'This transfer cannot be sent now.' }, 409);
  }
  await send(id);
  return json({ ok: true });
}

/** Submits one transfer. Reference = transfer id + attempt: a lost response retries with the same reference (Paystack
 *  de-duplicates it), a retry after a failure gets a fresh one. */
async function send(id: string) {
  const { data: t } = await db.from('payout_transfers').select('*, profiles:farmer_id(display_name)').eq('id', id).single();
  if (!t || !['queued', 'failed'].includes(t.status)) return;
  const fail = (msg: string) => apply(id, 'failed', null, msg);

  const rec = await paystack('/transferrecipient', { method: 'POST', body: JSON.stringify({
    type: 'mobile_money', name: t.momo_name ?? t.profiles?.display_name ?? 'Farmer', account_number: localMsisdn(t.momo_number),
    bank_code: MOMO_BANK[t.network], currency: 'GHS',
  }) });
  if (!rec.status || !rec.data?.recipient_code) return fail(rec.message || 'Paystack could not register this wallet.');

  const reference = `${t.id}_a${t.attempts + 1}`;
  await db.from('payout_transfers').update({ reference }).eq('id', id);
  const res = await paystack('/transfer', { method: 'POST', body: JSON.stringify({
    source: 'balance', amount: pesewas(Number(t.amount)), currency: 'GHS', recipient: rec.data.recipient_code, reference, reason: 'CryoChain farmer payout',
  }) });
  if (!res.status) return fail(res.message || 'Paystack rejected the transfer.');
  const st = String(res.data?.status ?? '');
  if (st === 'otp') return fail('Paystack wants an OTP. Turn off "Confirm transfers before sending" in the Paystack dashboard.');
  if (['failed', 'reversed', 'rejected', 'blocked'].includes(st)) return fail(`Paystack could not complete the transfer (${st}).`);
  await apply(id, st === 'success' ? 'succeeded' : 'sent', res.data?.transfer_code ?? null, null);
}

async function verify(id: string) {
  const { data: t } = await db.from('payout_transfers').select('reference, status').eq('id', id).single();
  if (!t?.reference) return json({ ok: true, status: t?.status ?? 'unknown' });
  const res = await paystack(`/transfer/verify/${encodeURIComponent(t.reference)}`);
  if (!res.status) return json({ error: res.message || 'Paystack could not find this transfer yet.' }, 502);
  const st = String(res.data?.status ?? '');
  if (st === 'success') await apply(id, 'succeeded', res.data?.transfer_code ?? null, null);
  else if (['failed', 'reversed', 'rejected', 'blocked'].includes(st)) await apply(id, 'failed', null, `Paystack reported ${st}.`);
  return json({ ok: true, provider: st });
}
