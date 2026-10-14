import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { startSignIn } from '../../../data/demoAuth';
import { afterSignIn } from '../screens/VerifyScreen';
import { useNav } from '../../../navigation';
import { signInFarmer } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { isEmail, isPhone } from '../../../utils/format';
import { errorMessage } from '../errors';

type Channel = 'phone' | 'email';
type Method = 'code' | 'password';

/** The single front door. A farmer signs in with a code or a password, not both. */
export function EntryCard() {
  const { push, reset } = useNav();
  const s = useThemedStyles(styles);
  const [channel, setChannel] = useState<Channel>('phone');
  const [method, setMethod] = useState<Method>('code');
  const [value, setValue] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = channel === 'phone' ? isPhone(value) : isEmail(value);
  const passwordReady = valid && password.length >= 8;

  const clear = (nextChannel?: Channel, nextMethod?: Method) => {
    if (nextChannel) {
      setChannel(nextChannel);
      setValue('');
    }
    if (nextMethod) setMethod(nextMethod);
    setPassword('');
    setError(null);
  };

  const submitCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const kind = await startSignIn(value);
      push({ name: 'verify', identifier: value.trim(), kind });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async () => {
    setBusy(true);
    setError(null);
    try {
      reset(afterSignIn(await signInFarmer(value, password)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={s.card}>
      <View style={s.tabs} accessibilityRole="tablist">
        {(['phone', 'email'] as const).map((item) => (
          <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: channel === item }} onPress={() => clear(item)} style={[s.tab, channel === item && s.tabOn]}>
            <Text style={[s.tabText, channel === item && s.tabTextOn]}>{item === 'phone' ? 'Phone' : 'Email'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.tabs} accessibilityRole="tablist">
        {(['code', 'password'] as const).map((item) => (
          <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: method === item }} onPress={() => clear(undefined, item)} style={[s.tab, method === item && s.tabOn]}>
            <Text style={[s.tabText, method === item && s.tabTextOn]}>{item === 'code' ? 'Code' : 'Password'}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Banner text={error} /> : null}
      {channel === 'phone' ? (
        <Input label="Mobile number" prefix="+233" value={value} onChangeText={setValue} keyboardType="phone-pad" autoComplete="tel" placeholder="24 000 0000" onSubmitEditing={() => (method === 'code' ? valid && submitCode() : passwordReady && submitPassword())} />
      ) : (
        <Input label="Email address" value={value} onChangeText={setValue} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" onSubmitEditing={() => (method === 'code' ? valid && submitCode() : passwordReady && submitPassword())} />
      )}
      {method === 'password' ? (
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={() => passwordReady && submitPassword()} />
      ) : null}
      {method === 'code' ? (
        <Button label="Continue" size="lg" icon="arrowRight" onPress={submitCode} loading={busy} disabled={!valid} />
      ) : (
        <Button label="Sign in" size="lg" onPress={submitPassword} loading={busy} disabled={!passwordReady} />
      )}
      <Text style={s.note}>
        {method === 'password'
          ? 'Password sign-in does not ask for a code.'
          : channel === 'phone'
            ? "We'll text you a 6-digit code. A correct code signs you in. No password."
            : "We'll email you a secure sign-in link. No password needed."}
      </Text>
    </Card>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 14, padding: 20 },
  tabs: { flexDirection: 'row' as const, backgroundColor: c.surfaceSunken, borderRadius: 12, padding: 4 },
  tab: { flex: 1, minHeight: 40, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 9 },
  tabOn: { backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.borderSubtle },
  tabText: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.inkMuted },
  tabTextOn: { color: c.ink },
  note: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: c.inkMuted, textAlign: 'center' as const },
});
