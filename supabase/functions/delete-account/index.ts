// Signed-in farmer/buyer deletes their own account: personal data is wiped (erase_account keeps financial
// records anonymised), then the auth user is soft-deleted so the number/email is freed and sign-in stops.
import { admin, asCaller, cors, json } from '../_shared/paystack.ts';

const REASONS: Record<string, [string, number]> = {
  in_flight: ['You have a payment, order or payout still in progress. Delete your account once it has settled.', 409],
  staff_account: ['Team accounts are managed by CryoChain operations. Contact your manager to remove yours.', 403],
  no_account: ['Account not found.', 404],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { data: who } = await asCaller(req).auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);

  const db = admin();
  const { error } = await db.rpc('erase_account', { p_id: who.user.id });
  if (error) {
    const [message, status] = REASONS[error.message] ?? ['Could not delete the account. Please try again.', 500];
    return json({ error: message }, status);
  }
  const { error: authError } = await db.auth.admin.deleteUser(who.user.id, true);
  if (authError) return json({ error: 'Your data was removed but sign-out failed. Contact support.' }, 500);
  return json({ ok: true });
});
