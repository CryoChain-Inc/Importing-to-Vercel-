import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Icon } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { toAccount } from '../../../data/demoAuth';
import { authService } from '../../../services/auth.service';
import { saveDetails, saveWallet } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import type { Account } from '../../../types/auth';
import { errorMessage } from '../../auth/errors';
import { useDraft } from '../../auth/hooks/useDraft';
import { DetailsForm } from '../components/DetailsForm';
import { WalletForm } from '../components/WalletForm';
import { detailsReady, walletReady } from '../validation';

const STEPS = ['About you', 'Payout wallet'];

/** Two steps: farm details, then the MoMo wallet (skippable, but listing stays locked without it). */
export function FarmerOnboarding({ onDone }: { onDone: (a: Account) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const details = useDraft('farmer-details', { name: '', address: '', locality: '', language: '' });
  const wallet = useDraft('farmer-wallet', { network: '', number: '', name: '' });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    const profile = await authService.getProfile();
    if (!profile) throw new Error('Sign in again to continue.');
    await Promise.all([details.clear(), wallet.clear()]);
    onDone(toAccount(profile));
  };

  const saveStepOne = () =>
    run(async () => {
      await saveDetails(details.value);
      setStep(1);
    });

  const saveStepTwo = () =>
    run(async () => {
      await saveWallet(wallet.value);
      await finish();
    });

  return (
    <View style={s.wrap}>
      <View style={s.steps} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((label, i) => (
          <View key={label} style={s.step}>
            <View style={[s.bar, i <= step && s.barOn]} />
            <View style={s.stepRow}>
              {i < step ? <Icon name="check" size={14} color={colors.brandInk} strokeWidth={3} /> : null}
              <Text style={[s.stepLabel, i === step && s.stepLabelOn]}>{label}</Text>
            </View>
          </View>
        ))}
      </View>
      {error ? <Banner text={error} /> : null}
      {step === 0 ? (
        <>
          <DetailsForm value={details.value} onChange={details.update} />
          <Button label="Continue" size="lg" icon="arrowRight" onPress={saveStepOne} loading={busy} disabled={!detailsReady(details.value)} />
        </>
      ) : (
        <>
          <Text style={s.note}>Payment for collected produce goes straight to this wallet. You can add it later, but you cannot list produce until it is saved.</Text>
          <WalletForm value={wallet.value} onChange={wallet.update} />
          <Button label="Save wallet and finish" size="lg" onPress={saveStepTwo} loading={busy} disabled={!walletReady(wallet.value)} />
          <Button label="Add later" variant="ghost" onPress={() => run(finish)} disabled={busy} />
        </>
      )}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 20 },
  steps: { flexDirection: 'row' as const, gap: 8 },
  step: { flex: 1, gap: 6 },
  bar: { height: 4, borderRadius: 2, backgroundColor: c.borderSubtle },
  barOn: { backgroundColor: c.brand600 },
  stepRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  stepLabel: { fontFamily: fonts.sansMedium, fontSize: 12, color: c.inkMuted },
  stepLabelOn: { fontFamily: fonts.sansBold, color: c.brandInk },
  note: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
});
