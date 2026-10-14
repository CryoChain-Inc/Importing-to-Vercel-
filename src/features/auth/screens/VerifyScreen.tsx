import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { AuthLayout } from '../../../components/layout';
import { sendCode, verifySignIn } from '../../../data/demoAuth';
import { DEMO_OTP } from '../../../data/accounts';
import { useNav, type Route } from '../../../navigation';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { isEmail, maskPhone } from '../../../utils/format';
import { VerifyCode } from '../components/VerifyCode';
import { errorMessage } from '../errors';
import { useCountdown } from '../hooks/useCountdown';

type VerifyRoute = Extract<Route, { name: 'verify' }>;

// Locked and wrong-code share one message so the screen never reveals account state.
const NEUTRAL = "We couldn't sign you in with that code. Check it and try again, or contact support if this keeps happening.";

export const afterSignIn = (account: Account): Route =>
  account.roles.length > 1 ? { name: 'workspace', account } : { name: 'home', account, role: account.roles[0] };

export function VerifyScreen({ route }: { route: VerifyRoute }) {
  const { identifier, kind } = route;
  const { push, reset } = useNav();
  const s = useThemedStyles(styles);
  const [mfa, setMfa] = useState(false);
  const email = isEmail(identifier);
  const target = email ? identifier : maskPhone(identifier);

  const submit = async (code: string) => {
    const r = await verifySignIn(identifier, code, mfa ? 'mfa' : 'primary');
    if (r.status === 'ok') reset(afterSignIn(r.account));
    else if (r.status === 'unknown') push({ name: 'role', identifier });
    else if (r.status === 'mfa') setMfa(true);
    else return NEUTRAL;
    return null;
  };
  const resend = () => sendCode(identifier).then(() => undefined);

  if (kind === 'invite-expired')
    return (
      <AuthLayout title="Invitation expired" subtitle="Ask your administrator to send a new invite. Staff accounts can't be created from this app.">
        <Banner text="This invitation is no longer valid." />
        <Button label="Back" variant="outline" onPress={() => reset({ name: 'landing' })} />
      </AuthLayout>
    );

  if (kind === 'magic-link')
    return (
      <AuthLayout title="Check your email" subtitle={`We sent a secure sign-in link to ${target}. Open it on this device to continue.`}>
        <MagicLink onOpen={() => submit(DEMO_OTP)} onResend={resend} />
      </AuthLayout>
    );

  return (
    <AuthLayout
      title={mfa ? 'One more step' : 'Enter your code'}
      subtitle={mfa ? 'Staff accounts need stronger verification. Enter the code from your authenticator app.' : `We sent a 6-digit code to ${target}.`}
    >
      <VerifyCode key={mfa ? 'mfa' : 'primary'} onSubmit={submit} onResend={resend} />
      <Text style={s.demo}>Demo: code {DEMO_OTP}{mfa ? ', staff MFA 654321' : ''}</Text>
    </AuthLayout>
  );
}

function MagicLink({ onOpen, onResend }: { onOpen: () => Promise<string | null>; onResend: () => Promise<void> }) {
  const s = useThemedStyles(styles);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, restart] = useCountdown(30);

  const open = async () => {
    setBusy(true);
    try {
      setError(await onOpen());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const resend = () =>
    onResend().then(() => { setError(null); restart(); }).catch((e) => setError(errorMessage(e)));

  return (
    <View style={s.wrap}>
      {error ? <Banner text={error} /> : null}
      {/* Demo only: stands in for tapping the link in the email. */}
      <Button label="Open the link (demo)" size="lg" onPress={open} loading={busy} />
      <Button label={cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend link'} variant="ghost" onPress={resend} disabled={cooldown > 0} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 12 },
  demo: { fontFamily: fonts.sansRegular, fontSize: 12, color: c.inkMuted, textAlign: 'center' as const },
});
