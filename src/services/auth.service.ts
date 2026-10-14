import { isEmail, normalizePhone } from '../utils/format';
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

  async completeOnboarding(role: 'farmer' | 'buyer', displayName: string) {
    const { error } = await supabase.rpc('complete_onboarding', { new_role: role, new_name: displayName });
    if (error) throw error;
  },

  signOut: () => supabase.auth.signOut(),
};
