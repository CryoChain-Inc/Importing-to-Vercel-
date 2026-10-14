import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { signInFarmer } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';

/** Existing phone or email: sign in with the password created at signup. */
export function FarmerReturningSignIn({
  identifier,
  onDone,
  onCreate,
}: {
  identifier: string;
  onDone: (account: Account) => void;
  onCreate: () => void;
}) {
  const s = useThemedStyles(styles);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await signInFarmer(identifier, password));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.form}>
      {error ? <Banner text={error} /> : null}
      <Text style={s.copy}>Enter the password you created. Your name, address, and bank details are already saved.</Text>
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      <Button label="Sign in" size="lg" onPress={submit} loading={busy} disabled={password.length < 8} />
      <Button label="Create a new farm account" variant="ghost" onPress={onCreate} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  form: { gap: 16 },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
});
