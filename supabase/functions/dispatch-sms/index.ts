// Sends any queued SMS. Called by the app after something is queued (a farmer declines, ops opens the board) and
// on a schedule (Supabase Cron). It cannot send anything that is not already queued by the database, so any signed-in
// user may call it.
import { asCaller, cors, json } from '../_shared/paystack.ts';
import { flushSms } from '../_shared/sms.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { data: who } = await asCaller(req).auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);
  return json(await flushSms());
});
