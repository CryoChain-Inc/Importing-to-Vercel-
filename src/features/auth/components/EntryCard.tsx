import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Button, Card, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { DEFAULT_COUNTRY, isNationalNumber, toE164 } from '../../../data/countries';
import { startSignIn } from '../../../data/demoAuth';
import { useNav } from '../../../navigation';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { isEmail } from '../../../utils/format';
import { errorMessage } from '../errors';
import { PhoneField } from './PhoneField';

/** The single front door: a phone number (with country code) or an email, then a one-time login code. */
export function EntryCard() {
  const { push } = useNav();
  const s = useThemedStyles(styles);
  const [viaEmail, setViaEmail] = useState(false);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = viaEmail ? isEmail(email) : isNationalNumber(country, phone);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const identifier = viaEmail ? email.trim() : toE164(country, phone);
      push({ name: 'verify', identifier, kind: await startSignIn(identifier) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (email: boolean) => {
    setViaEmail(email);
    setError(null);
  };

  return (
    <Card style={s.card}>
      {error ? <Banner text={error} /> : null}
      {viaEmail ? (
        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" onSubmitEditing={() => ready && submit()} />
      ) : (
        <PhoneField country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} onSubmitEditing={() => ready && submit()} />
      )}
      <Button label={viaEmail ? 'Email me a login code' : 'Text me a login code'} size="lg" icon="arrowRight" onPress={submit} loading={busy} disabled={!ready} />
      <TextLink label={viaEmail ? 'Use my phone number instead' : 'Use my email instead'} onPress={() => switchTo(!viaEmail)} />
      <Text style={s.note}>{"We'll send a 6-digit code to type in on the next screen. No password needed, and new accounts are set up the same way."}</Text>
    </Card>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  const s = useThemedStyles(styles);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [s.linkBox, pressed && { opacity: 0.6 }]}>
      <Text style={s.link}>{label}</Text>
    </Pressable>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  card: { gap: 14, padding: 20 },
  linkBox: { minHeight: 36, justifyContent: 'center' as const },
  link: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.brandInk },
  note: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: c.inkMuted, textAlign: 'center' as const },
});
