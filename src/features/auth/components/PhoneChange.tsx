import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { authService } from '../../../services/auth.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { DEFAULT_COUNTRY, isNationalNumber, toE164 } from '../../../data/countries';
import { formatPhone } from '../../../utils/format';
import { errorMessage } from '../errors';
import { useCountdown } from '../hooks/useCountdown';
import { OTP_LENGTH, OtpInput } from './OtpInput';
import { PhoneField } from './PhoneField';

const EXPIRY_S = 120;
const COOLDOWN_S = 30;

/** Adds or changes the signed-in user's phone: enter the number, then confirm the SMS code on a full-screen page. Saved only once confirmed. */
export function PhoneChange({ current, onDone, onCancel }: {
  current: string;
  onDone: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const s = useThemedStyles(styles);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [value, setValue] = useState('');
  // Same parsing as the login screen: 024 123 4567 and 24 123 4567 both become +233241234567.
  const phone = toE164(country, value);
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await authService.requestContactChange(phone);
      setVerifying(true);
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith('That phone') ? e.message : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.form}>
      {error ? <Banner text={error} /> : null}
      <PhoneField country={country} onCountry={setCountry} value={value} onChangeText={setValue} onSubmitEditing={() => isNationalNumber(country, value) && send()} />
      <Text style={s.note}>{current ? `You sign in with ${formatPhone(current)} today. We'll text a code to the new number.` : "We'll text a 6-digit code to confirm it."}</Text>
      <View style={s.actions}>
        {onCancel ? <Button label="Cancel" variant="outline" onPress={onCancel} style={s.action} /> : null}
        <Button label="Send code" onPress={send} loading={busy} disabled={!isNationalNumber(country, value)} style={s.action} />
      </View>
      <Modal visible={verifying} animationType="slide" onRequestClose={() => setVerifying(false)}>
        <PhoneVerifyPage phone={phone} onResend={() => authService.requestContactChange(phone)} onBack={() => setVerifying(false)} onDone={onDone} />
      </Modal>
    </View>
  );
}

/** Full-screen code entry. Submits on the sixth digit, so there is no button to hunt for under the keyboard. */
function PhoneVerifyPage({ phone, onResend, onBack, onDone }: {
  phone: string;
  onResend: () => Promise<void>;
  onBack: () => void;
  onDone: () => void | Promise<void>;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [expiresIn, restartExpiry] = useCountdown(phone, EXPIRY_S);
  const [cooldown, restartCooldown] = useCountdown(phone, COOLDOWN_S);
  const expired = expiresIn === 0;

  const submit = async (token: string) => {
    setBusy(true);
    setError(null);
    try {
      if (await authService.confirmContactChange(phone, token)) {
        setVerified(true);
        await onDone();
      } else {
        setError('That code is wrong or has expired.');
        setCode('');
      }
    } catch (e) {
      setError(errorMessage(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  // Submit on the sixth digit, from the input handler so there is no effect to re-fire.
  const change = (v: string) => {
    setCode(v);
    if (v.length === OTP_LENGTH && !expired && !busy && !verified) submit(v);
  };

  const resend = async () => {
    setBusy(true);
    try {
      await onResend();
      setError(null);
      setCode('');
      restartExpiry();
      restartCooldown();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.page}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Use a different number" style={s.close}>
        <Icon name="arrowLeft" size={20} color={colors.ink} />
      </Pressable>
      <View style={s.body}>
        <View style={s.badge}><Icon name={verified ? 'check' : 'message'} size={28} color={colors.brandInk} /></View>
        <Text style={s.title}>{verified ? 'Number verified' : 'Verify your number'}</Text>
        <Text style={s.copy}>
          {verified ? `${formatPhone(phone)} is now your sign-in number.` : `Enter the 6-digit code we texted to ${formatPhone(phone)}.`}
        </Text>
        {verified ? null : (
          <>
            {error ? <Banner text={error} /> : null}
            {expired ? <Banner text="That code has expired. Request a new one." /> : null}
            <OtpInput value={code} onChange={change} hasError={!!error} />
            <Text style={s.hint}>
              {busy ? 'Checking…' : expired ? ' ' : `Code expires in ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, '0')}`}
            </Text>
            <Button label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'} variant="tonal" onPress={resend} disabled={cooldown > 0 || busy} />
            <Button label="Wrong number? Change it" variant="ghost" onPress={onBack} disabled={busy} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  form: { gap: 12 },
  actions: { flexDirection: 'row' as const, gap: 12 },
  action: { flex: 1 },
  page: { flex: 1, backgroundColor: c.bgApp, paddingHorizontal: 20 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 8, backgroundColor: c.surfaceCard },
  body: { flex: 1, width: '100%' as const, maxWidth: 420, alignSelf: 'center' as const, justifyContent: 'center' as const, gap: 16, paddingBottom: 48 },
  badge: { width: 64, height: 64, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint, alignSelf: 'flex-start' as const },
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, letterSpacing: -0.4, color: c.ink },
  copy: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: c.inkMuted },
  note: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  hint: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18, color: c.inkMuted, textAlign: 'center' as const },
});
