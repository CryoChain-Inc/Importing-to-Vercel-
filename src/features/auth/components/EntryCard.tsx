import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Button, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { DEFAULT_COUNTRY, isNationalNumber, toE164 } from '../../../data/countries';
import { startSignIn } from '../../../data/demoAuth';
import { useNav } from '../../../navigation';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { EMAIL_MAX, isEmail } from '../../../utils/format';
import { errorMessage } from '../errors';
import { PhoneField } from './PhoneField';
import { SITE } from './AccountFooter';

/** The single front door: a phone number (with country code) or an email, then a one-time login code. */
export function EntryCard({ onFieldFocus }: { onFieldFocus?: (focused: boolean) => void }) {
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
    <View style={s.card}>
      {error ? <Banner text={error} /> : null}
      {viaEmail ? (
        <Input label="Email" onFocus={() => onFieldFocus?.(true)} onBlur={() => onFieldFocus?.(false)} value={email} onChangeText={setEmail} maxLength={EMAIL_MAX} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" onSubmitEditing={() => ready && submit()} />
      ) : (
        <PhoneField onFocus={() => onFieldFocus?.(true)} onBlur={() => onFieldFocus?.(false)} country={country} onCountry={setCountry} value={phone} onChangeText={setPhone} onSubmitEditing={() => ready && submit()} />
      )}
      <Button label="Continue" size="lg" icon="arrowRight" onPress={submit} loading={busy} disabled={!ready} />
      <TextLink label={viaEmail ? 'Use my phone number instead' : 'Use my email instead'} onPress={() => switchTo(!viaEmail)} />
      <Text style={s.note}>
        By continuing, you agree to our{' '}
        <Text accessibilityRole="link" style={s.legal} onPress={() => Linking.openURL(`${SITE}/terms.html`)}>Terms of Service</Text>
        {' and '}
        <Text accessibilityRole="link" style={s.legal} onPress={() => Linking.openURL(`${SITE}/privacy.html`)}>Privacy Policy</Text>
        {viaEmail ? '.' : ', and to receive a one-time login code by SMS. Message & data rates may apply.'}
      </Text>
    </View>
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
  card: { gap: 14 },
  linkBox: { minHeight: 36, justifyContent: 'center' as const },
  link: { fontFamily: fonts.sansSemiBold, fontSize: 14, color: c.brandInk },
  legal: { fontFamily: fonts.sansMedium, color: c.brandInk, textDecorationLine: 'underline' as const },
  note: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: c.inkMuted, textAlign: 'center' as const },
});
