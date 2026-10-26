import React from 'react';
import { View } from 'react-native';
import { Input } from '../../../components/common';
import { AddressFields } from '../../../components/location/AddressFields';
import type { FarmerDetails } from '../../../services/farmer.service';

/** Name and farm address (pinned on the map). Shared by onboarding and the profile tab. */
export function DetailsForm({ value, onChange }: { value: FarmerDetails; onChange: (patch: Partial<FarmerDetails>) => void }) {
  return (
    <View style={{ gap: 16 }}>
      <Input label="Full name" value={value.name} onChangeText={(name) => onChange({ name })} autoComplete="name" />
      <AddressFields value={value} onChange={onChange} />
    </View>
  );
}
