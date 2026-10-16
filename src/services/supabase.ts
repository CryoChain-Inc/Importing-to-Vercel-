import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const globalScope = globalThis as typeof globalThis & { __cryochainSupabase?: SupabaseClient };

function createSupabase(): SupabaseClient {
  return createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder-key', {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
}

// One client per page. A second copy (hot reload, a double import) refreshes the
// same token and the server then revokes the session a few minutes later.
export const supabase = globalScope.__cryochainSupabase ?? createSupabase();
globalScope.__cryochainSupabase = supabase;

/** Signed-in user id from the saved session. Refreshes only after the access token has expired. */
export async function requireUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
  if (session?.user?.id && expiresAt > Date.now()) return session.user.id;
  const { data: refreshed } = await supabase.auth.refreshSession();
  const id = refreshed.session?.user?.id;
  if (!id) throw new Error('Sign in again to continue.');
  return id;
}
