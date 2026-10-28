// Ops-only: creates an auth user (phone and/or email) for an agent, driver or ops staff member
// and provisions its profile role + detail row. Needs the service role, so it cannot run in the app.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // Caller must be a signed-in ops user (checked with their own JWT, so RLS applies).
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: who } = await caller.auth.getUser();
  if (!who.user) return json({ error: 'Sign in again to continue.' }, 401);
  const { data: me } = await caller.from('profiles').select('role').eq('id', who.user.id).maybeSingle();
  if (me?.role !== 'ops') return json({ error: 'Only ops can invite team members.' }, 403);

  let body: { name?: string; phone?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const digits = (body.phone ?? '').replace(/\D/g, '');
  const phone = digits ? `+${digits.startsWith('0') ? `233${digits.slice(1)}` : digits}` : '';

  if (!['agent', 'driver', 'ops'].includes(body.role ?? '')) return json({ error: 'Choose a valid role.' }, 400);
  if (name.length < 2 || name.length > 60) return json({ error: "Enter the person's name (60 characters at most)." }, 400);
  if (!phone && !email) return json({ error: 'Provide a phone number or an email.' }, 400);
  if (phone && !/^\+233\d{9}$/.test(phone)) return json({ error: 'Enter a valid Ghana phone number.' }, 400);
  if (email && (email.length > 60 || !/^\S+@\S+\.\S+$/.test(email))) return json({ error: 'Enter a valid email address, up to 60 characters.' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: created, error } = await admin.auth.admin.createUser({
    ...(email ? { email, email_confirm: true } : {}),
    ...(phone ? { phone, phone_confirm: true } : {}),
  });
  if (error || !created.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? '');
    return json({ error: taken ? 'That phone or email is already registered.' : 'Could not create the user.' }, taken ? 409 : 500);
  }

  const { error: provisionError } = await admin.rpc('provision_staff', { p_id: created.user.id, p_role: body.role, p_name: name });
  if (provisionError) {
    await admin.auth.admin.deleteUser(created.user.id); // don't leave a half-made account
    return json({ error: 'Could not set up the team member.' }, 500);
  }
  return json({ id: created.user.id });
});
