import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export async function caller(req: Request) {
  const header = req.headers.get('Authorization') ?? '';
  const jwt = header.replace('Bearer ', '');
  if (!jwt) return { error: json({ error: 'Sign in required.' }, 401) };
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return { error: json({ error: 'Sign in required.' }, 401) };
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();
  if (profileError || !profile)
    return { error: json({ error: 'Profile missing. Apply the database migration.' }, 403) };
  return { admin, user: data.user, profile };
}

export async function readWorkspace(admin: SupabaseClient) {
  const { data, error } = await admin
    .from('workspace')
    .select('version, state')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { version: number; state: Record<string, unknown> } | null;
}

export async function writeWorkspace(
  admin: SupabaseClient,
  version: number,
  state: Record<string, unknown>,
) {
  const { data, error } = await admin
    .from('workspace')
    .update({
      state,
      version: version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .eq('version', version)
    .select('version');
  if (error) throw new Error(error.message);
  return (data ?? [])[0] as { version: number } | undefined;
}

export async function mutateWorkspace(
  admin: SupabaseClient,
  change: (state: Record<string, unknown>) => void,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await readWorkspace(admin);
    if (!row) throw new Error('Workspace is not bootstrapped.');
    const state = structuredClone(row.state);
    change(state);
    const written = await writeWorkspace(admin, row.version, state);
    if (written) return written.version;
  }
  throw new Error('Could not save. Retry.');
}
