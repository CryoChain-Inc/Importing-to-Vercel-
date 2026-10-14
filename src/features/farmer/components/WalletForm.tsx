import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Input } from '../../../components/common';
import { PAYOUT_NETWORKS } from '../../../data/options';
import type { Wallet } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

/** MoMo network, number and registered name. Shared by onboarding and the profile tab. */
export function WalletForm({ value, onChange }: { value: Wallet; onChange: (patch: Partial<Wallet>) => void }) {
  const s = useThemedStyles(styles);
  return (
    <View style={s.wrap}>
      <Text style={s.label}>Mobile money network</Text>
      <View style={s.networks}>
        {PAYOUT_NETWORKS.map((n) => {
          const on = n === value.network;
          return (
            <Pressable key={n} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange({ network: n })} style={[s.network, on && s.networkOn]}>
              <Text style={[s.networkText, on && s.networkTextOn]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <Input label="Wallet number" prefix="+233" value={value.number} onChangeText={(number) => onChange({ number })} keyboardType="phone-pad" placeholder="24 000 0000" />
      <Input label="Name on the wallet" value={value.name} onChangeText={(name) => onChange({ name })} hint="Exactly as registered with your network. A mismatch pauses payouts." />
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 16 },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.ink },
  networks: { gap: 8 },
  network: { minHeight: 52, justifyContent: 'center' as const, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.surfaceCard },
  networkOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  networkText: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  networkTextOn: { fontFamily: fonts.sansBold, color: c.brandInk },
});
