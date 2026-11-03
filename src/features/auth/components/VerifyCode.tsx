import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from '../../../components/common';
import { useToast } from '../../../components/feedback';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import { errorMessage } from '../errors';
import { useCountdown } from '../hooks/useCountdown';
import { OTP_LENGTH, OtpInput } from './OtpInput';

const EXPIRY_S = 120;
const COOLDOWN_S = 30;

export interface VerifyCodeProps {
  /** Who the code was sent to; the countdowns run from when it was sent, so they survive leaving and returning. */
  identifier: string;
  /** Returns an error message, or null when the step is complete. */
  onSubmit: (code: string) => Promise<string | null>;
  onResend: () => Promise<void>;
  submitLabel?: string;
}

export function VerifyCode({ identifier, onSubmit, onResend, submitLabel = 'Confirm' }: VerifyCodeProps) {
  const s = useThemedStyles(styles);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [expiresIn, restartExpiry] = useCountdown(identifier, EXPIRY_S);
  const [cooldown, restartCooldown] = useCountdown(identifier, COOLDOWN_S);
  const expired = expiresIn === 0;
  const { show } = useToast();
  const [failed, setFailed] = useState(false);

  // Announced once, when the clock runs out; the screen itself then offers the next step.
  useEffect(() => {
    if (expired) show('That code has expired. Send a new one to continue.');
  }, [expired, show]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      show(errorMessage(e));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      const message = await onSubmit(code);
      if (message) show(message);
      setFailed(!!message);
      setCode('');
    });

  const resend = () =>
    run(async () => {
      await onResend();
      setFailed(false);
      show('New code sent.', 'success');
      setCode('');
      restartExpiry();
      restartCooldown();
    });

  return (
    <View style={s.wrap}>
      <OtpInput value={code} onChange={setCode} onSubmit={() => code.length === OTP_LENGTH && !expired && !busy && submit()} hasError={failed} />
      <Text style={[s.hint, expired && s.expired]}>
        {expired ? 'This code has expired' : `Code expires in ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, '0')}`}
      </Text>
      {expired ? null : <Button label={submitLabel} size="lg" onPress={submit} loading={busy} disabled={code.length !== OTP_LENGTH} />}
      <Button
        key={expired ? 'expired' : 'live'}
        label={cooldown > 0 ? `Resend code in ${cooldown}s` : expired ? 'Send a new code' : 'Resend code'}
        variant={expired ? 'primary' : 'outline'}
        size={expired ? 'lg' : 'md'}
        onPress={resend}
        loading={expired && busy}
        disabled={cooldown > 0 || busy}
      />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 16 },
  expired: { color: c.dangerInk },
  hint: { fontFamily: fonts.sansMedium, fontSize: 13, color: c.inkMuted, textAlign: 'center' as const },
});
