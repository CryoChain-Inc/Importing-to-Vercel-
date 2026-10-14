import React from 'react';
import { View } from 'react-native';
import { ChoiceChips, Input } from '../../../components/common';
import { LANGUAGES, LOCALITIES } from '../../../data/options';
import type { FarmerDetails } from '../../../services/farmer.service';

/** Name, address, locality and language. Shared by onboarding and the profile tab. */
export function DetailsForm({ value, onChange }: { value: FarmerDetails; onChange: (patch: Partial<FarmerDetails>) => void }) {
  return (
    <View style={{ gap: 16 }}>
      <Input label="Full name" value={value.name} onChangeText={(name) => onChange({ name })} autoComplete="name" />
      <Input label="Farm address" value={value.address} onChangeText={(address) => onChange({ address })} hint="Where an agent collects your produce." />
      <ChoiceChips label="Nearest town" options={LOCALITIES} value={value.locality} onChange={(locality) => onChange({ locality })} />
      <ChoiceChips label="Preferred language" options={LANGUAGES} value={value.language} onChange={(language) => onChange({ language })} />
    </View>
  );
}
