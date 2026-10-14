import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { startSignIn, toAccount } from '../../../data/demoAuth';
import { afterSignIn } from '../screens/VerifyScreen';
import { useNav } from '../../../navigation';
import { authService } from '../../../services/auth.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { isEmail, isPhone } from '../../../utils/format';
import { errorMessage } from '../errors';

/** The single front door: one field (phone or email) and a code. Password is a link, not a tab. */
export function EntryCard() {
  const { push, reset } = useNav();
  const s = useThemedStyles(styles);
  const [value, setValue] = useState('');
  const [password, setPassword] = useState('');
  const [usePassword, setUsePassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = isPhone(value) || isEmail(value);
  const ready = usePassword ? valid && password.length >= 8 : valid;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (usePassword) {
        await authService.signInWithPassword(value, password);
        const profile = await authService.getProfile();
        // No profile or role yet: the code flow handles registration.
        if (!profile || profile.role === 'pending') return setError('Sign in with a code to finish setting up your account.');
        reset(afterSignIn(toAccount(profile)));
      } else {
        push({ name: 'verify', identifier: value.trim(), kind: await startSignIn(value) });
      }
    } catch (e) {
      setError(usePassword ? 'That password does not match this account.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={s.card}>
      {error ? <Banner text={error} /> : null}
      <Input label="Mobile number or email" value={value} onChangeText={setValue} autoCapitalize="none" autoComplete="username" keyboardType="email-address" placeholder="024 000 0000 or you@example.com" onSubmitEditing={() => ready && submit()} />
      {usePassword ? (
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={() => ready && submit()} />
      ) : null}
      <Button label={usePassword ? 'Sign in' : 'Send code'} size="lg" icon="arrowRight" onPress={submit} loading={busy} disabled={!ready} />
      <Button
        label={usePassword ? 'Use a code instead' : 'Use password instead'}
        variant="ghost"
        onPress={() => {
          setUsePassword((v) => !v);
          setPassword('');
          setError(null);
        }}
      />
      <Text style={s.note}>{"We'll send a 6-digit code. A correct code signs you in, or sets up a new account."}</Text>
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 14, padding: 20 },
  note: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: c.inkMuted, textAlign: 'center' as const },
});
