import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ChoiceChips, Input } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { AuthLayout } from '../../../components/layout';
import { registerBuyer, registerFarmer, savePayout } from '../../../data/demoAuth';
import { DELIVERY_LOCATIONS, LANGUAGES, LOCALITIES, PAYOUT_NETWORKS } from '../../../data/options';
import { Switch } from 'react-native';
import { useNav } from '../../../navigation';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account, BuyerForm, FarmerForm, PayoutForm } from '../../../types/auth';
import { isEmail, isPhone } from '../../../utils/format';
import { DuplicateNotice } from '../components/DuplicateNotice';
import { errorMessage } from '../errors';
import { useDraft } from '../hooks/useDraft';
import { afterSignIn } from './VerifyScreen';

type FarmerDraft = FarmerForm & Pick<PayoutForm, 'network' | 'number' | 'consent'>;

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
    <AuthLayout title="Set up your farm" subtitle="Add your details and the mobile wallet where we'll send your payments.">
      <FarmerForm identifier={identifier} onDone={done} onDuplicate={() => setDuplicate(true)} />
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

function FarmerForm({ identifier, onDone, onDuplicate }: FormProps) {
  const s = useThemedStyles(styles);
  const viaEmail = isEmail(identifier);
  const { value: f, update, clear } = useDraft<FarmerDraft>('farmer', {
    name: '', phone: viaEmail ? '' : identifier, language: 'English', locality: '', network: '', number: '', consent: false,
  });
  const { busy, error, run } = useSubmit(onDone, onDuplicate, clear);
  const ready = f.name.trim().length > 1 && isPhone(f.phone) && f.locality !== '' && f.network !== '' && isPhone(f.number) && f.consent;

  const submit = () =>
    run(async () => {
      const r = await registerFarmer(f, viaEmail ? identifier.trim().toLowerCase() : undefined);
      if ('account' in r) r.account = (await savePayout(r.account.id)) ?? r.account;
      return r;
    });

  return (
    <View style={s.form}>
      {error ? <Banner text={error} /> : null}
      <Input label="Full name" value={f.name} onChangeText={(name) => update({ name })} autoComplete="name" hint="Used on your payment records." />
      {viaEmail ? <Input label="Mobile number" prefix="+233" value={f.phone} onChangeText={(phone) => update({ phone })} keyboardType="phone-pad" /> : null}
      <ChoiceChips label="Preferred language" options={LANGUAGES} value={f.language} onChange={(language) => update({ language })} />
      <ChoiceChips label="Collection locality" options={LOCALITIES} value={f.locality} onChange={(locality) => update({ locality })} />
      <Text style={s.section}>Payout wallet</Text>
      <ChoiceChips label="Mobile-money network" options={PAYOUT_NETWORKS} value={f.network} onChange={(network) => update({ network })} />
      <Input label="Wallet number" prefix="+233" value={f.number} onChangeText={(number) => update({ number })} keyboardType="phone-pad" hint="Must be registered in your name." />
      <View style={s.consent}>
        <Switch value={f.consent} onValueChange={(consent) => update({ consent })} accessibilityLabel="Consent to payouts" />
        <Text style={s.consentText}>I agree that CryoChain may send my payments to this wallet.</Text>
      </View>
      <Button label="Create account" size="lg" onPress={submit} loading={busy} disabled={!ready} />
    </View>
  );
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
  section: { fontFamily: fonts.sansBold, fontSize: 16, color: c.ink, marginTop: 8 },
  consent: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  consentText: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
});
