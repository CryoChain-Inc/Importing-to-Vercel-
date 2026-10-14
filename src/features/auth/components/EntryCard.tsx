import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { startSignIn } from '../../../data/demoAuth';
import { useNav } from '../../../navigation';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { isEmail, isPhone } from '../../../utils/format';
import { errorMessage } from '../errors';

type Mode = 'phone' | 'email';

/** The single front door: sign in and registration both start here. */
export function EntryCard() {
  const { push } = useNav();
  const s = useThemedStyles(styles);
  const [mode, setMode] = useState<Mode>('phone');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = mode === 'phone' ? isPhone(value) : isEmail(value);

  const submit = async () => {
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

  return (
    <Card style={s.card}>
      <View style={s.tabs} accessibilityRole="tablist">
        {(['phone', 'email'] as const).map((m) => (
          <Pressable key={m} accessibilityRole="tab" accessibilityState={{ selected: mode === m }} onPress={() => { setMode(m); setValue(''); setError(null); }} style={[s.tab, mode === m && s.tabOn]}>
            <Text style={[s.tabText, mode === m && s.tabTextOn]}>{m === 'phone' ? 'Phone' : 'Email'}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Banner text={error} /> : null}
      {mode === 'phone' ? (
        <Input label="Mobile number" prefix="+233" value={value} onChangeText={setValue} keyboardType="phone-pad" autoComplete="tel" placeholder="24 000 0000" onSubmitEditing={() => valid && submit()} />
      ) : (
        <Input label="Email address" value={value} onChangeText={setValue} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" onSubmitEditing={() => valid && submit()} />
      )}
      <Button label="Continue" size="lg" icon="arrowRight" onPress={submit} loading={busy} disabled={!valid} />
      <Text style={s.note}>
        {mode === 'phone' ? "We'll text you a 6-digit code. New here? We'll set you up next." : "We'll email you a secure sign-in link. No password needed."}
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
