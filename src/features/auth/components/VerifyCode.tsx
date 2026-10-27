import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { errorMessage } from '../errors';
import { useCountdown } from '../hooks/useCountdown';
import { OTP_LENGTH, OtpInput } from './OtpInput';

const EXPIRY_S = 120;
const COOLDOWN_S = 30;

export interface VerifyCodeProps {
  /** Returns an error message, or null when the step is complete. */
  onSubmit: (code: string) => Promise<string | null>;
  onResend: () => Promise<void>;
  submitLabel?: string;
}

export function VerifyCode({ onSubmit, onResend, submitLabel = 'Confirm' }: VerifyCodeProps) {
  const s = useThemedStyles(styles);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expiresIn, restartExpiry] = useCountdown(EXPIRY_S);
  const [cooldown, restartCooldown] = useCountdown(COOLDOWN_S);
  const expired = expiresIn === 0;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      setError(await onSubmit(code));
      setCode('');
    });

  const resend = () =>
    run(async () => {
      await onResend();
      setError(null);
      setCode('');
      restartExpiry();
      restartCooldown();
    });

  return (
    <View style={s.wrap}>
      {error ? <Banner text={error} /> : null}
      {expired ? <Banner text="That code has expired. Request a new one." /> : null}
      <OtpInput value={code} onChange={setCode} onSubmit={() => code.length === OTP_LENGTH && !expired && !busy && submit()} hasError={!!error} />
      {expired ? null : <Text style={s.hint}>Code expires in {Math.floor(expiresIn / 60)}:{String(expiresIn % 60).padStart(2, '0')}</Text>}
      <Button label={submitLabel} size="lg" onPress={submit} loading={busy} disabled={code.length !== OTP_LENGTH || expired} />
      <Button label={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'} variant="ghost" onPress={resend} disabled={cooldown > 0 || busy} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 16 },
  hint: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted, textAlign: 'center' as const },
});
