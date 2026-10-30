import { markCodeSent } from '../utils/codeTimer';
import { isEmail, normalizePhone } from '../utils/format';
import { clearOfflineCache } from './offlineCache';
import { supabase } from './supabase';

export type UserRole = 'pending' | 'farmer' | 'buyer' | 'agent' | 'driver' | 'ops';

export interface UserProfile {
  id: string;
  role: UserRole;
  display_name: string | null;
  phone: string | null;
  email: string | null;
}

const target = (identifier: string) =>
  isEmail(identifier)
    ? { email: identifier.trim().toLowerCase() }
    : { phone: `+${normalizePhone(identifier)}` };

export const authService = {
  /** Sends a 6-digit code by SMS (test numbers get a fixed code, no SMS) or email. */
  async sendOtp(identifier: string) {
    const { error } = await supabase.auth.signInWithOtp(target(identifier));
    if (error) throw error;
    markCodeSent(identifier);
  },

  /** Returns false for a wrong or expired code. */
  async verifyOtp(identifier: string, token: string) {
    const t = target(identifier);
    const { error } = await supabase.auth.verifyOtp(
      'email' in t ? { ...t, token, type: 'email' } : { ...t, token, type: 'sms' },
    );
    return !error;
  },

  /** Optional alternative to a code, for accounts that have a password. */
  async signInWithPassword(identifier: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ ...target(identifier), password });
    if (error) throw error;
  },

  async getProfile(): Promise<UserProfile | null> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error) throw error;
    return data as UserProfile | null;
  },

  /** Sets the buyer role and creates the empty buyers row; details are filled in from the app. */
  async completeBuyerOnboarding() {
    const { error } = await supabase.rpc('complete_buyer_onboarding');
    if (error) throw error;
  },

  /** Starts adding or changing the signed-in user's email/phone. A code goes to the new phone; pass `redirectTo` to email a confirmation link instead. */
  async requestContactChange(identifier: string, redirectTo?: string) {
    const attrs = target(identifier);
    const { error } = redirectTo ? await supabase.auth.updateUser(attrs, { emailRedirectTo: redirectTo }) : await supabase.auth.updateUser(attrs);
    if (!error) return markCodeSent(identifier);
    if (error.code === 'email_exists' || error.code === 'phone_exists')
      throw new Error(`That ${isEmail(identifier) ? 'email' : 'phone number'} belongs to another account.`);
    throw error;
  },

  /** Returns false for a wrong or expired code. On success auth.users (and, via trigger, profiles) holds the new value. */
  async confirmContactChange(identifier: string, token: string) {
    const t = target(identifier);
    const { error } = await supabase.auth.verifyOtp(
      'email' in t ? { ...t, token, type: 'email_change' } : { ...t, token, type: 'phone_change' },
    );
    return !error;
  },

  /** Pulls the latest auth user, e.g. after an emailed confirmation link was opened. */
  async refreshSession() {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw error;
  },

  /** Erases the signed-in farmer/buyer's personal data and closes the account; throws the server's reason if it is refused. */
  async deleteAccount() {
    const { error } = await supabase.functions.invoke('delete-account');
    if (!error) return;
    // Non-2xx responses hide the body inside error.context.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(body?.error ?? 'Could not delete the account. Please try again.');
  },

  signOut: async () => {
    await clearOfflineCache().catch(() => undefined);
    return supabase.auth.signOut();
  },
};
