import * as Location from 'expo-location';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Input } from '../../../components/common';
import type { FarmerDetails } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

/** Name, address and current location. Shared by onboarding and the profile tab. */
export function DetailsForm({ value, onChange }: { value: FarmerDetails; onChange: (patch: Partial<FarmerDetails>) => void }) {
  const s = useThemedStyles(styles);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const locate = async () => {
    setLocating(true);
    setLocError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Allow location access to use this.');
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      onChange({ latitude: coords.latitude, longitude: coords.longitude });
    } catch (e) {
      setLocError(e instanceof Error ? e.message : 'Could not get your location.');
    } finally {
      setLocating(false);
    }
  };

  const has = value.latitude != null && value.longitude != null;
  return (
    <View style={{ gap: 16 }}>
      <Input label="Full name" value={value.name} onChangeText={(name) => onChange({ name })} autoComplete="name" />
      <Input label="Farm address" value={value.address} onChangeText={(address) => onChange({ address })} hint="Where an agent collects your produce." />
      <View style={{ gap: 8 }}>
        <Text style={s.label}>Farm location</Text>
        {has ? <Text style={s.coords}>{value.latitude!.toFixed(5)}, {value.longitude!.toFixed(5)}</Text> : null}
        {locError ? <Text style={s.error}>{locError}</Text> : null}
        <Button label={has ? 'Update location' : 'Use my current location'} variant="outline" onPress={locate} loading={locating} />
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  label: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: c.inkMuted },
  coords: { fontFamily: fonts.sansMedium, fontSize: 16, color: c.ink },
  error: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
});
