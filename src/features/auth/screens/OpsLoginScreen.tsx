import React, { useState } from 'react';
import { AuthLayout } from '../../../components/layout';
import { Button, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { toAccount } from '../../../data/demoAuth';
import { useNav } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import { GOVT_EMAIL } from '../../../services/report.service';
import { isEmail } from '../../../utils/format';
import { afterSignIn } from './VerifyScreen';

/** Staff-only door at /ops (ops accounts) and /govt (the single government account): email and password. */
export function OpsLoginScreen({ govt = false }: { govt?: boolean }) {
  const { reset } = useNav();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = isEmail(email) && password.length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (govt && email.trim().toLowerCase() !== GOVT_EMAIL)
        return setError('This sign in is for government officials only.');
      await authService.signInWithPassword(email, password);
      const profile = await authService.getProfile();
      if (profile?.role !== (govt ? 'govt' : 'ops')) {
        await authService.signOut();
        return setError(
          govt
            ? 'That account does not have government access.'
            : 'That account does not have operations access.',
        );
      }
      reset(afterSignIn(toAccount(profile)));
    } catch {
      setError('That email and password do not match.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={govt ? 'Government sign in' : 'Operations sign in'}
      subtitle={
        govt
          ? 'For government officials. Farmer and stock reports for CryoChain.'
          : 'For CryoChain staff. Farmers and buyers sign in from the home page.'
      }
    >
      {error ? <Banner text={error} /> : null}
      <Input
        label="Work email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder={govt ? GOVT_EMAIL : 'you@cryochain.com'}
      />
      <Input
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        onSubmitEditing={() => ready && submit()}
      />
      <Button
        label="Sign in"
        size="lg"
        icon="arrowRight"
        onPress={submit}
        loading={busy}
        disabled={!ready}
      />
    </AuthLayout>
  );
}
