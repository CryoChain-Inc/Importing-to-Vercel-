import React, { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/common';
import { Banner } from '../../../components/feedback';
import { toAccount } from '../../../data/demoAuth';
import { authService } from '../../../services/auth.service';
import { saveDetails } from '../../../services/farmer.service';
import { errorMessage } from '../../auth/errors';
import { useDraft } from '../../auth/hooks/useDraft';
import { DetailsForm } from '../components/DetailsForm';
import { detailsReady } from '../validation';
import type { Account } from '../../../types/auth';

/** One step: farm details. The payout wallet is added later from the profile tab (listing stays locked without it). */
export function FarmerOnboarding({ onDone }: { onDone: (a: Account) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const details = useDraft('farmer-details', { name: '', address: '', locality: '', latitude: null as number | null, longitude: null as number | null });

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveDetails(details.value);
      const profile = await authService.getProfile();
      if (!profile) throw new Error('Sign in again to continue.');
      await details.clear();
      onDone(toAccount(profile));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 20 }}>
      {error ? <Banner text={error} /> : null}
      <DetailsForm value={details.value} onChange={details.update} />
      <Button label="Finish" size="lg" icon="arrowRight" onPress={submit} loading={busy} disabled={!detailsReady(details.value)} />
    </View>
  );
}
