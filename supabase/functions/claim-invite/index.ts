import { adminClient, cors, json } from '../_shared/db.ts';

type ListedUser = {
  id: string;
  email?: string;
  invited_at?: string;
  user_metadata?: Record<string, unknown>;
};

/**
 * Attaches a password to an invited login that does not have one yet.
 * The invite email is the production path. This is the path used when that
 * person instead fills Create account with the invited email.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST required.' }, 405);
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '')
    .trim()
    .toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !email.includes('@')) return json({ error: 'Enter the invited email.' }, 400);
  if (password.length < 6) return json({ error: 'Use at least 6 characters.' }, 400);

  try {
    const admin = adminClient();
    const user = await findByEmail(admin, email);
    if (!user) return json({ error: 'No login was found for that email.' }, 400);
    if (!user.invited_at || user.user_metadata?.needs_password === false) {
      return json(
        { error: 'This email already has a password. Sign in, or use Forgot password.' },
        400,
      );
    }

    const metadata = {
      ...(user.user_metadata ?? {}),
      needs_password: false,
    };
    const updated = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (updated.error) return json({ error: updated.error.message }, 400);
    return json({ ok: true });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Could not save the password.' },
      400,
    );
  }
});

async function findByEmail(admin: ReturnType<typeof adminClient>, email: string) {
  for (let page = 1; page <= 20; page++) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) throw new Error(listed.error.message);
    const users = (listed.data?.users ?? []) as ListedUser[];
    const found = users.find((user) => (user.email ?? '').toLowerCase() === email);
    if (found) return found;
    if (users.length < 200) return null;
  }
  return null;
}
