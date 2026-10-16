// Looks up the registered name of a mobile-money wallet via Paystack. Advisory only: the app lets the
// farmer save the wallet whether or not this succeeds.
import { asCaller, cors, json, localMsisdn, MOMO_BANK, paystack } from '../_shared/paystack.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { data: who } = await asCaller(req).auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);

  const { network, number } = await req.json().catch(() => ({}));
  const code = MOMO_BANK[network];
  const local = localMsisdn(number);
  if (!code || !/^0\d{9}$/.test(local)) return json({ error: 'Choose a network and enter a valid number.' }, 400);

  const res = await paystack(`/bank/resolve?account_number=${local}&bank_code=${code}`);
  const name = res.data?.account_name;
  if (!res.status || !name) return json({ error: 'Could not verify this wallet.' }, 200);
  return json({ name });
});
