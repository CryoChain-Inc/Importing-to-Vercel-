import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { useDraft } from '../../auth/hooks/useDraft';
import { registerFarmerAccount, type FarmerDetails } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { isEmail, isPhone } from '../../../utils/format';

const ACCOUNT_NUMBER = /^\d{6,20}$/;

export function FarmerSignupForm({
  identifier,
  onDone,
  onDuplicate,
}: {
  identifier: string;
  onDone: (account: Account) => void;
  onDuplicate: () => void;
}) {
  const s = useThemedStyles(styles);
  const viaEmail = isEmail(identifier);
  const { value: details, update, clear } = useDraft<FarmerDetails>('farmer-profile', {
    name: '',
    phone: viaEmail ? '' : identifier,
    address: '',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
  });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accountNumber = details.accountNumber.replace(/\s/g, '');
  const ready =
    details.name.trim().length > 1 &&
    isPhone(details.phone) &&
    details.address.trim().length > 2 &&
    details.bankName.trim().length > 1 &&
    details.accountHolder.trim().length > 1 &&
    ACCOUNT_NUMBER.test(accountNumber) &&
    password.length >= 8;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await registerFarmerAccount({
        ...details,
        accountNumber,
        email: viaEmail ? identifier.trim().toLowerCase() : undefined,
        password,
      });
      if ('duplicate' in result) return onDuplicate();
      await clear();
      onDone(result.account);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.form}>
      {error ? <Banner text={error} /> : null}
      <Input label="Full name" value={details.name} onChangeText={(name) => update({ name })} autoComplete="name" />
      {viaEmail ? (
        <Input label="Mobile number" prefix="+233" value={details.phone} onChangeText={(phone) => update({ phone })} keyboardType="phone-pad" />
      ) : null}
      <Input
        label="Address"
        value={details.address}
        onChangeText={(address) => update({ address })}
        autoComplete="street-address"
        hint="Where the agent collects your produce."
      />
      <Text style={s.section}>Bank account</Text>
      <Input label="Bank name" value={details.bankName} onChangeText={(bankName) => update({ bankName })} hint="Payment is sent here when the agent takes the produce." />
      <Input label="Account name" value={details.accountHolder} onChangeText={(accountHolder) => update({ accountHolder })} autoComplete="name" />
      <Input
        label="Account number"
        value={details.accountNumber}
        onChangeText={(accountNumber) => update({ accountNumber })}
        keyboardType="number-pad"
        hint="6 to 20 digits."
      />
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint="At least 8 characters. You'll need it to sign in again." />
      <Button label="Create account" size="lg" onPress={submit} loading={busy} disabled={!ready} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  form: { gap: 16 },
  section: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, marginTop: 8 },
});
