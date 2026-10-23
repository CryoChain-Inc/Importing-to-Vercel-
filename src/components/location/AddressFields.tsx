import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { AddressValue, PlaceInfo } from '../../services/maps.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';
import { Button, Icon, Input } from '../common';
import { LocationPicker } from './LocationPicker';

export function AddressFields({ value, onChange }: { value: AddressValue; onChange: (patch: Partial<AddressValue>) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const has = value.latitude != null && value.longitude != null;

  const picked = (p: PlaceInfo) => {
    // Re-picking keeps what the person typed for flat and landmark; the map owns the rest.
    onChange({ address: p.address, city: p.city, postcode: p.postcode, latitude: p.latitude, longitude: p.longitude });
    setOpen(false);
  };

  return (
    <View style={s.wrap}>
      <View style={s.location}>
        <View style={s.locationHead}>
          <Icon name="pin" size={20} color={has ? colors.brandInk : colors.inkMuted} />
          <Text style={s.locationTitle}>{has ? 'Pinned location' : 'Location'}</Text>
        </View>
        {has ? (
          <>
            <Text style={s.locationAddress}>{value.address || 'Pinned on the map'}</Text>
            <Text style={s.coords}>{value.latitude!.toFixed(5)}, {value.longitude!.toFixed(5)}</Text>
          </>
        ) : (
          <Text style={s.locationHint}>Drop a pin so our driver finds the exact spot.</Text>
        )}
        <Button label={has ? 'Change on map' : 'Choose on map'} icon="pin" variant={has ? 'outline' : 'primary'} size="sm" onPress={() => setOpen(true)} />
      </View>
      <Input label="Address" value={value.address} onChangeText={(address) => onChange({ address })} maxLength={240} multiline hint="Street and area. Edit it if the map got it slightly wrong." />
      <Input label="House, flat or building" value={value.line1} onChangeText={(line1) => onChange({ line1 })} maxLength={80} placeholder="e.g. Shop 12, Block B" autoComplete="street-address" />
      <Input label="Landmark (optional)" value={value.landmark} onChangeText={(landmark) => onChange({ landmark })} maxLength={80} placeholder="e.g. Opposite the petrol station" />
      <View style={s.pair}>
        <View style={s.half}><Input label="City" value={value.city} onChangeText={(city) => onChange({ city })} maxLength={80} /></View>
        <View style={s.half}><Input label="Postcode" value={value.postcode} onChangeText={(postcode) => onChange({ postcode })} maxLength={20} autoCapitalize="characters" /></View>
      </View>
      <LocationPicker
        visible={open}
        initial={has ? { latitude: value.latitude!, longitude: value.longitude! } : null}
        onClose={() => setOpen(false)}
        onPick={picked}
      />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 16 },
  location: { gap: 8, padding: 14, borderRadius: 16, backgroundColor: c.brandTint, alignItems: 'flex-start' as const },
  locationHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  locationTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: c.brandInk },
  locationAddress: { fontFamily: fonts.sansSemiBold, fontSize: 15, lineHeight: 21, color: c.ink },
  coords: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted, fontVariant: ['tabular-nums' as const] },
  locationHint: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  pair: { flexDirection: 'row' as const, gap: 12 },
  half: { flex: 1 },
});
