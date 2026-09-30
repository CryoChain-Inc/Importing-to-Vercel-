import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { colors, fontFamily } from '../ui/theme';
import { supabase } from './client';
import { commit, type Profile } from './remote';

type AuthValue = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

let emailLinkAdopted = false;
async function sessionFromEmailLink() {
  if (emailLinkAdopted || typeof window === 'undefined') return;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hash.includes('access_token')) return;
  const params = new URLSearchParams(hash);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return;
  emailLinkAdopted = true;
  window.history.replaceState({}, '', window.location.pathname);
  await supabase.auth.setSession({ access_token, refresh_token });
}

const AuthCtx = createContext<AuthValue | null>(null);
export function useAuth() {
  const value = useContext(AuthCtx);
  if (!value) throw new Error('AuthProvider missing');
  return value;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const refresh = async () => {
    await sessionFromEmailLink();
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (!data.session) { setProfile(null); setProfileError(null); return; }
    const found = await supabase.from('profiles').select('*').eq('id', data.session.user.id).maybeSingle();
    if (found.error) { setProfile(null); setProfileError(found.error.message); return; }
    if (found.data) { setProfile(found.data as Profile); setProfileError(null); return; }
    const ensured = await supabase.rpc('ensure_my_profile');
    if (ensured.error || !ensured.data) { setProfile(null); setProfileError(ensured.error?.message ?? 'No profile row for this account.'); return; }
    setProfile(ensured.data as Profile);
    setProfileError(null);
  };

  useEffect(() => {
    let live = true;
    refresh().finally(() => { if (live) setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void refresh(); });
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); setProfile(null); };
  return <AuthCtx.Provider value={{ ready, session, profile, profileError, refresh, signOut }}>{children}</AuthCtx.Provider>;
}

export function SetupScreen() {
  return <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: 28, gap: 14, maxWidth: 720 }}>
    <Text style={{ fontFamily: fontFamily('600'), fontSize: 28, color: colors.ink }}>Connect CryoChain</Text>
    <Text style={{ fontSize: 16, lineHeight: 24, color: colors.ink }}>The operating record, payments, text messages, and photographs stay off this device until a Supabase project is connected. Add these two values to cryochain-mobile/.env and restart the app.</Text>
    <Text style={{ fontFamily: fontFamily('600'), color: colors.ink }}>EXPO_PUBLIC_SUPABASE_URL</Text>
    <Text style={{ fontFamily: fontFamily('600'), color: colors.ink }}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text>
    <Text style={{ fontSize: 15, lineHeight: 22, color: colors.steelInk }}>Use the anon key only. The service role key belongs in Supabase Edge Function secrets, never in the app. After the file is in place, run the migration, deploy the functions, and sign in. The first account becomes the node manager.</Text>
  </ScrollView>;
}

export function AuthScreen() {
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+233');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submitEmail = async () => {
    setError('');
    setInfo('');
    if (name) {
      const { error: signError } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } });
      if (signError) setError(signError.message);
      else setInfo('Account created. If Supabase asks you to confirm the email, open that message, then sign in here.');
      return;
    }
    const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
    if (signError) setError(signError.message);
  };

  const sendCode = async () => {
    setError('');
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    if (otpError) setError(otpError.message + ' Phone sign-in needs a provider such as Twilio enabled under Authentication in Supabase.');
    else setSent(true);
  };

  const verify = async () => {
    setError('');
    const { error: otpError } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (otpError) setError(otpError.message);
  };

  return <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: 28, gap: 12, maxWidth: 480 }}>
    <Text style={{ fontFamily: fontFamily('600'), fontSize: 28, color: colors.ink }}>Sign in</Text>
    <Text style={{ color: colors.steelInk, lineHeight: 22 }}>The first person to create an account becomes the node manager and opens an empty operating record. Everyone else waits until operations invites them.</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable onPress={() => setMode('email')}><Text style={{ fontFamily: fontFamily(mode === 'email' ? '700' : '500'), color: colors.blue }}>Email</Text></Pressable>
      <Pressable onPress={() => setMode('phone')}><Text style={{ fontFamily: fontFamily(mode === 'phone' ? '700' : '500'), color: colors.blue }}>Phone</Text></Pressable>
    </View>
    {mode === 'email' ? <>
      <Field label="Your name, only when creating an account" value={name} onChange={setName} />
      <Field label="Email" value={email} onChange={setEmail} keyboard="email-address" />
      <Field label="Password" value={password} onChange={setPassword} secure />
      <Pressable onPress={() => void submitEmail()} style={{ backgroundColor: colors.blue, borderRadius: 8, padding: 14 }}><Text style={{ color: '#fff', textAlign: 'center', fontFamily: fontFamily('600') }}>{name ? 'Create account' : 'Sign in'}</Text></Pressable>
    </> : <>
      <Field label="Phone" value={phone} onChange={setPhone} keyboard="phone-pad" />
      {sent ? <Field label="Code" value={code} onChange={setCode} /> : null}
      <Pressable onPress={() => void (sent ? verify() : sendCode())} style={{ backgroundColor: colors.blue, borderRadius: 8, padding: 14 }}><Text style={{ color: '#fff', textAlign: 'center', fontFamily: fontFamily('600') }}>{sent ? 'Verify code' : 'Send code'}</Text></Pressable>
    </>}
    {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    {info ? <Text style={{ color: colors.ink, lineHeight: 22 }}>{info}</Text> : null}
  </ScrollView>;
}

function Field({ label, value, onChange, secure, keyboard }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean; keyboard?: 'email-address' | 'phone-pad' }) {
  return <View style={{ gap: 6 }}>
    <Text style={{ fontSize: 12, color: colors.steelInk }}>{label}</Text>
    <TextInput value={value} onChangeText={onChange} secureTextEntry={secure} keyboardType={keyboard} autoCapitalize="none" style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, fontSize: 16, color: colors.ink, backgroundColor: '#fff' }} />
  </View>;
}

export function MissingProfile() {
  const { profileError, refresh, signOut } = useAuth();
  return <View style={{ flex: 1, backgroundColor: colors.paper, padding: 28, justifyContent: 'center', gap: 12, maxWidth: 640 }}>
    <Text style={{ fontFamily: fontFamily('600'), fontSize: 24, color: colors.ink }}>Account confirmed</Text>
    <Text style={{ lineHeight: 22, color: colors.ink }}>The first script does not create a profile for an account that already existed. In the Supabase SQL editor, run cryochain-mobile/supabase/migrations/20260929130000_backfill_profiles.sql, then press Check again.</Text>
    {profileError ? <Text style={{ lineHeight: 20, color: colors.red }}>{profileError}</Text> : null}
    <Pressable onPress={() => void refresh()} style={{ backgroundColor: colors.blue, borderRadius: 8, padding: 14 }}><Text style={{ color: '#fff', textAlign: 'center', fontFamily: fontFamily('600') }}>Check again</Text></Pressable>
    <Pressable onPress={() => void signOut()}><Text style={{ color: colors.blue, fontFamily: fontFamily('600') }}>Sign out</Text></Pressable>
  </View>;
}

export function PendingAccess() {
  const { profile, refresh, signOut } = useAuth();
  const [error, setError] = useState('');
  const become = async () => {
    const res = await commit({ op: 'become', role: 'buyer' });
    if (res.error) setError(res.error);
    else await refresh();
  };
  return <View style={{ flex: 1, backgroundColor: colors.paper, padding: 28, justifyContent: 'center', gap: 12 }}>
    <Text style={{ fontFamily: fontFamily('600'), fontSize: 24, color: colors.ink }}>Waiting for access</Text>
    <Text style={{ lineHeight: 22, color: colors.ink }}>{profile?.display_name || 'This account'} is signed in, and operations has not assigned a role yet. A buyer can register an organisation from here. Farmers, agents, drivers, and staff wait for an invite from the node manager.</Text>
    <Pressable onPress={() => void become()} style={{ backgroundColor: colors.blue, borderRadius: 8, padding: 14 }}><Text style={{ color: '#fff', textAlign: 'center', fontFamily: fontFamily('600') }}>Register a buyer organisation</Text></Pressable>
    <Pressable onPress={() => void signOut()}><Text style={{ color: colors.blue, fontFamily: fontFamily('600') }}>Sign out</Text></Pressable>
    {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
  </View>;
}

export function AccountBar() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.ink }}>
    <Text style={{ color: '#fff', fontFamily: fontFamily('600'), fontSize: 13 }}>{profile.display_name} · {profile.role}</Text>
    <Pressable onPress={() => void signOut()}><Text style={{ color: '#fff', fontSize: 13 }}>Sign out</Text></Pressable>
  </View>;
}
