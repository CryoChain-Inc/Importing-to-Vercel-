import { supabase } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

export type UserRole = 'buyer' | 'farmer' | 'agent' | 'driver' | 'ops' | 'pending';

export interface UserProfile {
  id: string;
  role: UserRole;
  display_name: string;
  phone: string | null;
  org_id: string | null;
  buyer_user_id: string | null;
  farmer_id: string | null;
  ops_user_id: string | null;
  device_id: string | null;
}

export const authService = {
  async getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  async getUser(): Promise<User | null> {
    const { data } = await supabase.auth.getUser();
    return data.user;
  },

  async getProfile(userId: string): Promise<UserProfile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;
    return data as UserProfile;
  },

  async signInWithEmail(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },

  async signUp(email: string, password: string, displayName: string) {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
  },

  async signOut() {
    return supabase.auth.signOut();
  },

  onAuthStateChange(callback: (session: Session | null) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
  },
};
