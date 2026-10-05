import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { colors, fontFamily } from '../ui/theme';
import {
  clearPasswordSetup,
  markPasswordSaved,
  passwordSavedFor,
  peekPasswordSetup,
  supabase,
} from './client';
import { claimInvite, commit, type Profile } from './remote';

type AuthValue = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  mustSetPassword: boolean;
  refresh: () => Promise<void>;
  finishPassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

function passwordStillOpen(user: Session['user'] | null | undefined) {
  const link = peekPasswordSetup();
  if (link === 'recovery') return true;
  if (user && passwordSavedFor(user.id)) return false;
  if (link === 'invite') return true;
  if (!user) return false;
  const flag = user.user_metadata?.needs_password;
  if (flag === true) return true;
  if (flag === false) return false;
  return Boolean(user.invited_at);
}

let emailLinkAdopted = false;
/**
 * Extracts magic link / invite tokens from the URL hash, establishes the session,
 * and immediately purges the hash from the browser URL to prevent token leakage in history or referrers.
 */
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
  const [mustSetPassword, setMustSetPassword] = useState(false);

  const refresh = async () => {
    await sessionFromEmailLink();
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    setMustSetPassword(Boolean(data.session) && passwordStillOpen(data.session?.user));
    if (!data.session) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    const found = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.session.user.id)
      .maybeSingle();
    if (found.error) {
      setProfile(null);
      setProfileError(found.error.message);
      return;
    }
    if (found.data) {
      setProfile(found.data as Profile);
      setProfileError(null);
      return;
    }
    // Fallback RPC creates profile row if the auth trigger had not fired yet.
    const ensured = await supabase.rpc('ensure_my_profile');
    if (ensured.error || !ensured.data) {
      setProfile(null);
      setProfileError(ensured.error?.message ?? 'No profile row for this account.');
      return;
    }
    setProfile(ensured.data as Profile);
    setProfileError(null);
  };

  useEffect(() => {
    let live = true;
    refresh().finally(() => {
      if (live) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const finishPassword = async (password: string) => {
    const { data, error } = await supabase.auth.updateUser({
      password,
      data: { needs_password: false },
    });
    if (error) return error.message;
    if (data.user) markPasswordSaved(data.user.id);
    clearPasswordSetup();
    setMustSetPassword(false);
    await refresh();
    return null;
  };
  const signOut = async () => {
    clearPasswordSetup();
    await supabase.auth.signOut();
    setProfile(null);
    setMustSetPassword(false);
  };
  return (
    <AuthCtx.Provider
      value={{
        ready,
        session,
        profile,
        profileError,
        mustSetPassword,
        refresh,
        finishPassword,
        signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function SetupScreen() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: 28, gap: 14, maxWidth: 720 }}
    >
      <Text style={{ fontFamily: fontFamily('600'), fontSize: 28, color: colors.ink }}>
        Connect CryoChain
      </Text>
      <Text style={{ fontSize: 16, lineHeight: 24, color: colors.ink }}>
        The operating record, payments, text messages, and photographs stay off this device until a
        Supabase project is connected. Add these two values to cryochain-mobile/.env and restart the
        app.
      </Text>
      <Text style={{ fontFamily: fontFamily('600'), color: colors.ink }}>
        EXPO_PUBLIC_SUPABASE_URL
      </Text>
      <Text style={{ fontFamily: fontFamily('600'), color: colors.ink }}>
        EXPO_PUBLIC_SUPABASE_ANON_KEY
      </Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: colors.steelInk }}>
        Use the anon key only. The service role key belongs in Supabase Edge Function secrets, never
        in the app. After the file is in place, run the migration, deploy the functions, and sign
        in. The first account becomes the node manager.
      </Text>
    </ScrollView>
  );
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
    const address = email.trim().toLowerCase();
    if (!address || !password) {
      setError('Enter the email and a password.');
      return;
    }
    if (name.trim()) {
      const { data, error: signError } = await supabase.auth.signUp({
        email: address,
        password,
        options: { data: { display_name: name.trim() } },
      });
      // An invite already has a login. signUp can open a one-time session without
      // storing the password, so the password is attached to that same login.
      const invited = Boolean(
        data.user?.invited_at || data.user?.user_metadata?.needs_password === true,
      );
      const taken =
        !!signError &&
        /already registered|already been registered|already exists/i.test(signError.message);
      if (signError && !taken) {
        setError(signError.message);
        return;
      }
      if (!invited && !taken) {
        setInfo(
          'Account created. If Supabase asks you to confirm the email, open that message, then sign in here.',
        );
        return;
      }
      if (invited) await supabase.auth.signOut();
      const claimed = await claimInvite(address, password);
      if (claimed.error) {
        setError(claimed.error);
        return;
      }
      const { error: inError } = await supabase.auth.signInWithPassword({
        email: address,
        password,
      });
      if (inError) setError(inError.message);
      return;
    }
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: address,
      password,
    });
    if (signError) setError(signError.message);
  };

  const forgot = async () => {
    setError('');
    setInfo('');
    const address = email.trim().toLowerCase();
    if (!address) {
      setError('Enter the email address, then use Forgot password.');
      return;
    }
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo,
    });
    if (resetError) setError(resetError.message);
    else
      setInfo(
        'Check that email for a link to choose a new password. On the local stack the message is in Mailpit at http://127.0.0.1:54324.',
      );
  };

  const sendCode = async () => {
    setError('');
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    if (otpError)
      setError(
        otpError.message +
          ' Phone sign-in needs a provider such as Twilio enabled under Authentication in Supabase.',
      );
    else setSent(true);
  };

  const verify = async () => {
    setError('');
    const { error: otpError } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (otpError) setError(otpError.message);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: 28, gap: 12, maxWidth: 480 }}
    >
      <Text style={{ fontFamily: fontFamily('600'), fontSize: 28, color: colors.ink }}>
        Sign in
      </Text>
      <Text style={{ color: colors.steelInk, lineHeight: 22 }}>
        The first person to create an account becomes the node manager and opens an empty operating
        record. If operations invited you, enter your name, that email, and a password, then create
        the account. The password is saved on the invited login.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={() => setMode('email')}>
          <Text
            style={{ fontFamily: fontFamily(mode === 'email' ? '700' : '500'), color: colors.blue }}
          >
            Email
          </Text>
        </Pressable>
        <Pressable onPress={() => setMode('phone')}>
          <Text
            style={{ fontFamily: fontFamily(mode === 'phone' ? '700' : '500'), color: colors.blue }}
          >
            Phone
          </Text>
        </Pressable>
      </View>
      {mode === 'email' ? (
        <>
          <Field label="Your name, only when creating an account" value={name} onChange={setName} />
          <Field label="Email" value={email} onChange={setEmail} keyboard="email-address" />
          <Field label="Password" value={password} onChange={setPassword} secure />
          <Pressable
            onPress={() => void submitEmail()}
            style={{ backgroundColor: colors.blue, borderRadius: 8, padding: 14 }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontFamily: fontFamily('600') }}>
              {name ? 'Create account' : 'Sign in'}
            </Text>
          </Pressable>
          {name ? null : (
            <Pressable onPress={() => void forgot()}>
              <Text style={{ color: colors.blue, fontFamily: fontFamily('600') }}>
                Forgot password
              </Text>
            </Pressable>
          )}
        </>
      ) : (
        <>
          <Field label="Phone" value={phone} onChange={setPhone} keyboard="phone-pad" />
          {sent ? <Field label="Code" value={code} onChange={setCode} /> : null}
          <Pressable
            onPress={() => void (sent ? verify() : sendCode())}
            style={{ backgroundColor: colors.blue, borderRadius: 8, padding: 14 }}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontFamily: fontFamily('600') }}>
              {sent ? 'Verify code' : 'Send code'}
            </Text>
          </Pressable>
        </>
      )}
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
      {info ? <Text style={{ color: colors.ink, lineHeight: 22 }}>{info}</Text> : null}
    </ScrollView>
  );
}

export function SetPasswordScreen() {
  const { session, finishPassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const recovery = peekPasswordSetup() === 'recovery';
  const email = session?.user.email ?? 'this account';
  const save = async () => {
    setError('');
    if (password.length < 6) {
      setError('Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    setBusy(true);
    const message = await finishPassword(password);
    setBusy(false);
    if (message) setError(message);
  };
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: 28, gap: 12, maxWidth: 480 }}
    >
      <Text style={{ fontFamily: fontFamily('600'), fontSize: 28, color: colors.ink }}>
        {recovery ? 'Choose a new password' : 'Set a password'}
      </Text>
      <Text style={{ color: colors.steelInk, lineHeight: 22 }}>
        {recovery
          ? `Choose a new password for ${email}. You will use it the next time you sign in.`
          : `Choose a password for ${email}. This stays on the account operations invited. You will use this email and password each time you sign in.`}
      </Text>
      <Field label="Password" value={password} onChange={setPassword} secure />
      <Field label="Confirm password" value={confirm} onChange={setConfirm} secure />
      <Pressable
        onPress={() => void save()}
        disabled={busy}
        style={{
          backgroundColor: colors.blue,
          borderRadius: 8,
          padding: 14,
          opacity: busy ? 0.7 : 1,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontFamily: fontFamily('600') }}>
          {busy ? 'Saving…' : 'Save password'}
        </Text>
      </Pressable>
      <Pressable onPress={() => void signOut()} disabled={busy}>
        <Text style={{ color: colors.blue, fontFamily: fontFamily('600') }}>Sign out</Text>
      </Pressable>
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  keyboard?: 'email-address' | 'phone-pad';
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, color: colors.steelInk }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        keyboardType={keyboard}
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: 8,
          padding: 12,
          fontSize: 16,
          color: colors.ink,
          backgroundColor: '#fff',
        }}
      />
    </View>
  );
}

export function MissingProfile() {
  const { profileError, refresh, signOut } = useAuth();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.paper,
        padding: 28,
        justifyContent: 'center',
        gap: 12,
        maxWidth: 640,
      }}
    >
      <Text style={{ fontFamily: fontFamily('600'), fontSize: 24, color: colors.ink }}>
        Account confirmed
      </Text>
      <Text style={{ lineHeight: 22, color: colors.ink }}>
        The first script does not create a profile for an account that already existed. In the
        Supabase SQL editor, run
        cryochain-mobile/supabase/migrations/20260929130000_backfill_profiles.sql, then press Check
        again.
      </Text>
      {profileError ? (
        <Text style={{ lineHeight: 20, color: colors.red }}>{profileError}</Text>
      ) : null}
      <Pressable
        onPress={() => void refresh()}
        style={{ backgroundColor: colors.blue, borderRadius: 8, padding: 14 }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontFamily: fontFamily('600') }}>
          Check again
        </Text>
      </Pressable>
      <Pressable onPress={() => void signOut()}>
        <Text style={{ color: colors.blue, fontFamily: fontFamily('600') }}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const REQUEST_ROLES = [
  { value: 'agent', label: 'Field agent' },
  { value: 'driver', label: 'Driver' },
  { value: 'farmer', label: 'Farmer' },
] as const;

export function PendingAccess() {
  const { profile, refresh, signOut } = useAuth();
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [role, setRole] = useState<(typeof REQUEST_ROLES)[number]['value']>('agent');
  const [sent, setSent] = useState('');
  const become = async () => {
    setError('');
    const res = await commit({ op: 'become', role: 'buyer' });
    if (res.error) setError(res.error);
    else await refresh();
  };
  const request = async () => {
    setError('');
    setInfo('');
    const res = await commit({ op: 'request', role });
    if (res.error) setError(res.error);
    else {
      setSent(role);
      setInfo(
        'Request sent. The node manager approves it from Team access. Press Check again after they approve.',
      );
    }
  };
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const requested = data.user?.user_metadata?.requested_role;
      if (requested === 'agent' || requested === 'driver' || requested === 'farmer') {
        setRole(requested);
        setSent(requested);
      }
    });
  }, []);
  const requestedLabel = REQUEST_ROLES.find((item) => item.value === sent)?.label;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.paper,
        padding: 28,
        justifyContent: 'center',
        gap: 12,
      }}
    >
      <Text style={{ fontFamily: fontFamily('600'), fontSize: 24, color: colors.ink }}>
        Waiting for access
      </Text>
      <Text style={{ lineHeight: 22, color: colors.ink }}>
        {profile?.display_name || 'This account'} is signed in. Choose field agent, driver, or
        farmer and send a request. The node manager approves it from Team access. A buyer can
        register an organisation without waiting.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {REQUEST_ROLES.map((item) => (
          <Pressable key={item.value} onPress={() => setRole(item.value)}>
            <Text
              style={{
                fontFamily: fontFamily(role === item.value ? '700' : '500'),
                color: colors.blue,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={() => void request()}
        style={{ backgroundColor: colors.blue, borderRadius: 8, padding: 14 }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontFamily: fontFamily('600') }}>
          Request {REQUEST_ROLES.find((item) => item.value === role)?.label.toLowerCase()} access
        </Text>
      </Pressable>
      {requestedLabel ? (
        <Text style={{ lineHeight: 22, color: colors.ink }}>
          Waiting for the node manager to approve {requestedLabel.toLowerCase()} access.
        </Text>
      ) : null}
      <Pressable
        onPress={() => void become()}
        style={{ borderWidth: 1, borderColor: colors.blue, borderRadius: 8, padding: 14 }}
      >
        <Text style={{ color: colors.blue, textAlign: 'center', fontFamily: fontFamily('600') }}>
          Register a buyer organisation
        </Text>
      </Pressable>
      <Pressable
        onPress={() => void refresh()}
        style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 14 }}
      >
        <Text style={{ color: colors.ink, textAlign: 'center', fontFamily: fontFamily('600') }}>
          Check again
        </Text>
      </Pressable>
      <Pressable onPress={() => void signOut()}>
        <Text style={{ color: colors.blue, fontFamily: fontFamily('600') }}>Sign out</Text>
      </Pressable>
      {error ? <Text style={{ color: colors.red }}>{error}</Text> : null}
      {info ? <Text style={{ lineHeight: 22, color: colors.ink }}>{info}</Text> : null}
    </View>
  );
}

export function AccountBar() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: colors.ink,
      }}
    >
      <Text style={{ color: '#fff', fontFamily: fontFamily('600'), fontSize: 13 }}>
        {profile.display_name} · {profile.role}
      </Text>
      <Pressable onPress={() => void signOut()}>
        <Text style={{ color: '#fff', fontSize: 13 }}>Sign out</Text>
      </Pressable>
    </View>
  );
}
