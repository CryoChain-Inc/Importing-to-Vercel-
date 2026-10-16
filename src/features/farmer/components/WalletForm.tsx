import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Input } from '../../../components/common';
import { PAYOUT_NETWORKS } from '../../../data/options';
import { lookupWalletName, type Wallet } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

/** MoMo network, number and registered name. Shared by onboarding and the profile tab. */
export function WalletForm({ value, onChange }: { value: Wallet; onChange: (patch: Partial<Wallet>) => void }) {
  const s = useThemedStyles(styles);
  const [checking, setChecking] = useState(false);
  // undefined = not checked yet, null = couldn't verify, string = name registered with the network
  const [found, setFound] = useState<string | null | undefined>();
  const same = found?.trim().toLowerCase() === value.name.trim().toLowerCase();

  const check = async () => {
    setChecking(true);
    try {
      setFound(await lookupWalletName(value.network, value.number));
    } catch {
      setFound(null);
    } finally {
      setChecking(false);
    }
  };
  const edit = (patch: Partial<Wallet>) => {
    setFound(undefined);
    onChange(patch);
  };

  return (
    <View style={s.wrap}>
      <Text style={s.label}>Mobile money network</Text>
      <View style={s.networks}>
        {PAYOUT_NETWORKS.map((n) => {
          const on = n === value.network;
          return (
            <Pressable key={n} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => edit({ network: n })} style={[s.network, on && s.networkOn]}>
              <Text style={[s.networkText, on && s.networkTextOn]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
      <Input label="Wallet number" prefix="+233" value={value.number} onChangeText={(number) => edit({ number })} keyboardType="phone-pad" placeholder="24 000 0000" />
      <Input label="Name on the wallet" value={value.name} onChangeText={(name) => onChange({ name })} hint="Exactly as registered with your network. A mismatch pauses payouts." />
      <Button size="sm" variant="outline" label="Verify wallet" loading={checking} disabled={!value.network || value.number.replace(/\D/g, '').length < 9} onPress={check} />
      {found === null ? <Text style={s.note}>We couldn’t verify this wallet. You can still save it; just check the number and name.</Text> : null}
      {found ? (
        <View style={s.note}>
          <Text style={s.note}>Registered name: {found}</Text>
          {same ? <Text style={s.ok}>Matches the name you entered.</Text> : (
            <>
              <Text style={s.note}>This differs from “{value.name || 'no name'}”. You can still save.</Text>
              <Button size="sm" variant="tonal" label="Use this name" onPress={() => onChange({ name: found })} />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 16 },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.ink },
  note: { gap: 8, fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  ok: { fontFamily: fonts.sansBold, fontSize: 13, color: c.brandInk },
  networks: { gap: 8 },
  network: { minHeight: 52, justifyContent: 'center' as const, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.surfaceCard },
  networkOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  networkText: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  networkTextOn: { fontFamily: fonts.sansBold, color: c.brandInk },
});
