import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { AuthLayout } from '../../../components/layout';
import { registerBuyer } from '../../../data/demoAuth';
import { DELIVERY_LOCATIONS } from '../../../data/options';
import { FarmerOnboarding } from '../../farmer/onboarding/FarmerOnboarding';
import { useNav } from '../../../navigation';
import { useThemedStyles, type ColorToken } from '../../../theme';
import type { Account, BuyerForm } from '../../../types/auth';
import { isEmail, isPhone } from '../../../utils/format';
import { DuplicateNotice } from '../components/DuplicateNotice';
import { errorMessage } from '../errors';
import { useDraft } from '../hooks/useDraft';
import { afterSignIn } from './VerifyScreen';

export function OnboardingScreen({ identifier, role }: { identifier: string; role: 'farmer' | 'buyer' }) {
  const { reset } = useNav();
  const [duplicate, setDuplicate] = useState(false);
  const done = (a: Account) => reset(afterSignIn(a));

  if (duplicate)
    return (
      <AuthLayout title="Account found" subtitle="These details match an existing account.">
        <DuplicateNotice onRecover={() => reset({ name: 'landing' })} />
      </AuthLayout>
    );

  return role === 'farmer' ? (
    <AuthLayout title="Set up your farm" subtitle="Two quick steps so an agent can collect your produce and pay you.">
      <FarmerOnboarding onDone={done} />
    </AuthLayout>
  ) : (
    <AuthLayout title="Set up your business" subtitle="Business verification may still be pending after this. You can start right away.">
      <BuyerFormView identifier={identifier} onDone={done} onDuplicate={() => setDuplicate(true)} />
    </AuthLayout>
  );
}

interface FormProps {
  identifier: string;
  onDone: (a: Account) => void;
  onDuplicate: () => void;
}

function useSubmit(onDone: FormProps['onDone'], onDuplicate: FormProps['onDuplicate'], clear: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<{ account: Account } | { duplicate: true }>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if ('duplicate' in r) return onDuplicate();
      await clear();
      onDone(r.account);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function BuyerFormView({ identifier, onDone, onDuplicate }: FormProps) {
  const s = useThemedStyles(styles);
  const viaEmail = isEmail(identifier);
  const { value: f, update, clear } = useDraft<BuyerForm>('buyer', {
    business: '', contact: '', phone: viaEmail ? '' : identifier, email: viaEmail ? identifier.trim() : '', location: '',
  });
  const { busy, error, run } = useSubmit(onDone, onDuplicate, clear);
  const ready = f.business.trim().length > 1 && f.contact.trim().length > 1 && (isPhone(f.phone) || isEmail(f.email)) && f.location !== '';

  return (
    <View style={s.form}>
      {error ? <Banner text={error} /> : null}
      <Input label="Business name" value={f.business} onChangeText={(business) => update({ business })} autoComplete="organization" />
      <Input label="Contact person" value={f.contact} onChangeText={(contact) => update({ contact })} autoComplete="name" />
      {viaEmail ? (
        <Input label="Phone number" prefix="+233" value={f.phone} onChangeText={(phone) => update({ phone })} keyboardType="phone-pad" hint="For delivery updates." />
      ) : (
        <Input label="Email (optional)" value={f.email} onChangeText={(email) => update({ email })} keyboardType="email-address" autoCapitalize="none" hint="For sign-in links and order updates." />
      )}
      <ChoiceChips label="Delivery location" options={DELIVERY_LOCATIONS} value={f.location} onChange={(location) => update({ location })} />
      <Button label="Create account" size="lg" onPress={() => run(() => registerBuyer(f))} loading={busy} disabled={!ready} />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  form: { gap: 16 },
});
