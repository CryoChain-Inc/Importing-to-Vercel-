import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from './config';

const PASSWORD_SETUP_KEY = 'cc-password-setup';
const PASSWORD_DONE_KEY = 'cc-password-done';

export type PasswordLink = 'invite' | 'recovery';

/**
 * Invite and recovery emails put `type` in the URL hash. The client strips that hash
 * while adopting the session, so the kind is stored before the client is created.
 */
function linkKindFromLocation(): PasswordLink | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const type =
    new URLSearchParams(hash).get('type') ||
    new URLSearchParams(window.location.search).get('type');
  if (type === 'invite' || type === 'recovery') return type;
  return null;
}

function rememberPasswordSetup() {
  const kind = linkKindFromLocation();
  if (!kind || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(PASSWORD_SETUP_KEY, kind);
}

rememberPasswordSetup();

export function peekPasswordSetup(): PasswordLink | null {
  if (typeof sessionStorage === 'undefined') return linkKindFromLocation();
  const stored = sessionStorage.getItem(PASSWORD_SETUP_KEY);
  if (stored === 'invite' || stored === 'recovery') return stored;
  return null;
}

export function clearPasswordSetup() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PASSWORD_SETUP_KEY);
}

export function markPasswordSaved(userId: string) {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(PASSWORD_DONE_KEY, userId);
}

export function passwordSavedFor(userId: string) {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(PASSWORD_DONE_KEY) === userId;
}

/**
 * Shared Supabase client for React Native mobile & web.
 * Persists auth sessions to device AsyncStorage and auto-detects magic link tokens in browser URLs.
 */
export const supabase = createClient(
  supabaseUrl || 'https://example.supabase.co',
  supabaseAnonKey || 'public-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
);
