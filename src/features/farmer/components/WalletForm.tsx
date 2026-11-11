import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon, Input } from '../../../components/common';
import { PAYOUT_NETWORKS } from '../../../data/options';
import { lookupWalletName, type Wallet } from '../../../services/farmer.service';
import { NAME_MAX } from '../../../utils/format';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

/** MoMo network, number and registered name. Shared by onboarding and the profile tab. */
export function WalletForm({ value, onChange }: { value: Wallet; onChange: (patch: Partial<Wallet>) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
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

  const ready = !!value.network && value.number.replace(/\D/g, '').length >= 9;
  const verified = !!found && same;
  return (
    <View style={s.wrap}>
      <View style={s.group}>
        <Text style={s.label}>Mobile money network</Text>
        <View style={s.networks}>
          {PAYOUT_NETWORKS.map((n) => {
            const on = n === value.network;
            return (
              <Pressable key={n} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => edit({ network: n })} style={[s.network, on && s.networkOn]}>
                {on ? <Icon name="check" size={16} color={colors.brandInk} strokeWidth={3} /> : null}
                <Text style={[s.networkText, on && s.networkTextOn]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Input label="Wallet number" prefix="+233" value={value.number.replace(/^233/, '')} onChangeText={(t) => { const d = t.replace(/\D/g, ''); edit({ number: d && !d.startsWith('0') ? `233${d}` : d }); }} keyboardType="phone-pad" placeholder="24 000 0000" />
      <Input label="Name on the wallet" value={value.name} onChangeText={(name) => onChange({ name })} maxLength={NAME_MAX} hint="As registered with your network. A mismatch pauses payouts." />
      <View style={[s.verify, verified && s.verifyOk, found === null && s.verifyWarn]}>
        <View style={s.verifyHead}>
          <View style={[s.seal, verified && s.sealOk]}>
            <Icon name={verified ? 'check' : 'shield'} size={20} color={verified ? colors.onBrand : colors.brandInk} strokeWidth={verified ? 3 : 2} />
          </View>
          <View style={s.verifyText}>
            <Text style={s.verifyTitle}>{verified ? 'Wallet verified' : found ? 'Name doesn’t match' : found === null ? 'Couldn’t verify' : 'Check this wallet'}</Text>
            <Text style={s.note}>
              {verified ? `Registered to ${found}.` : found ? `Registered to ${found}, not “${value.name || 'no name'}”.` : found === null ? 'Check the number and name. You can still save.' : 'We confirm the name with your network before payouts.'}
            </Text>
          </View>
        </View>
        {found && !same ? <Button size="sm" variant="tonal" label="Use registered name" onPress={() => onChange({ name: found.slice(0, NAME_MAX) })} /> : null}
        {verified ? null : <Button variant="primary" icon="shield" label={found !== undefined ? 'Verify again' : 'Verify wallet'} loading={checking} disabled={!ready} onPress={check} />}
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 20 },
  group: { gap: 8 },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.ink },
  note: { fontFamily: fonts.sansRegular, fontSize: 13, lineHeight: 18, color: c.inkMuted },
  networks: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  network: { flexGrow: 1, flexBasis: 120, minHeight: 52, flexDirection: 'row' as const, gap: 6, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.surfaceCard },
  networkOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  networkText: { fontFamily: fonts.sansMedium, fontSize: 15, color: c.ink },
  networkTextOn: { fontFamily: fonts.sansBold, color: c.brandInk },
  verify: { gap: 12, padding: 14, borderRadius: 18, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.surfaceCard },
  verifyOk: { borderColor: c.brand600, backgroundColor: c.brandTint },
  verifyWarn: { borderColor: c.dangerInk },
  verifyHead: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  verifyText: { flex: 1, gap: 2 },
  verifyTitle: { fontFamily: fonts.sansBold, fontSize: 15, color: c.ink },
  seal: { width: 40, height: 40, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  sealOk: { backgroundColor: c.brand600 },
});
