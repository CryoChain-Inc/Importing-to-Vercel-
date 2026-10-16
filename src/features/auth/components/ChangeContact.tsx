import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { authService } from '../../../services/auth.service';
import { EMAIL_MAX, isEmail, isPhone } from '../../../utils/format';
import { errorMessage } from '../errors';
import { VerifyCode } from './VerifyCode';

/** Adds or changes the signed-in user's email or phone: sends a code to the new value, saves it only once confirmed. */
export function ChangeContact({ kind, current, onDone, onCancel }: {
  kind: 'email' | 'phone';
  current: string;
  onDone: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = kind === 'email' ? isEmail(value) : isPhone(value);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await authService.requestContactChange(value);
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent)
    return (
      <VerifyCode
        submitLabel={`Confirm ${kind}`}
        onResend={() => authService.requestContactChange(value)}
        onSubmit={async (code) => {
          if (!(await authService.confirmContactChange(value, code))) return 'That code is wrong or expired.';
          await onDone();
          return null;
        }}
      />
    );

  return (
    <View style={{ gap: 12 }}>
      {error ? <Banner text={error} /> : null}
      <Input
        label={kind === 'email' ? 'Email' : 'Phone number'}
        prefix={kind === 'phone' ? '+233' : undefined}
        value={value}
        onChangeText={setValue}
        maxLength={kind === 'email' ? EMAIL_MAX : undefined}
        keyboardType={kind === 'email' ? 'email-address' : 'phone-pad'}
        autoCapitalize="none"
        hint={current ? `Currently ${current}. We'll send a code to confirm the new one.` : "We'll send a code to confirm it."}
      />
      <Button label="Send code" onPress={send} loading={busy} disabled={!valid} />
      {onCancel ? <Button label="Not now" variant="ghost" onPress={onCancel} /> : null}
    </View>
  );
}
