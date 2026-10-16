// Looks up the registered name of a mobile-money wallet via Paystack. Advisory only: the app lets the
// farmer save the wallet whether or not this succeeds.
import { asCaller, cors, json, paystack } from '../_shared/paystack.ts';

const BANK_CODES: Record<string, string> = { 'MTN MoMo': 'MTN', 'Telecel Cash': 'VOD', 'AirtelTigo Money': 'ATL' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { data: who } = await asCaller(req).auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);

  const { network, number } = await req.json().catch(() => ({}));
  const code = BANK_CODES[network];
  const digits = String(number ?? '').replace(/\D/g, '');
  const local = digits.startsWith('233') ? `0${digits.slice(3)}` : digits.startsWith('0') ? digits : `0${digits}`;
  if (!code || !/^0\d{9}$/.test(local)) return json({ error: 'Choose a network and enter a valid number.' }, 400);

  const res = await paystack(`/bank/resolve?account_number=${local}&bank_code=${code}`);
  const name = res.data?.account_name;
  if (!res.status || !name) return json({ error: 'Could not verify this wallet.' }, 200);
  return json({ name });
});
