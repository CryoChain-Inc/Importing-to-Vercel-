import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon, type IconName } from '../../../components/common';
import { AuthLayout } from '../../../components/layout';
import { Banner } from '../../../components/feedback';
import { useNav } from '../../../navigation';
import { toAccount } from '../../../data/demoAuth';
import { authService } from '../../../services/auth.service';
import { afterSignIn } from './VerifyScreen';
import { createFarmer } from '../../../services/farmer.service';
import { errorMessage } from '../errors';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

const ROLES: { role: 'farmer' | 'buyer'; icon: IconName; title: string; copy: string }[] = [
  { role: 'farmer', icon: 'leaf', title: 'Farmer', copy: 'Sell produce and get paid per consignment.' },
  { role: 'buyer', icon: 'package', title: 'Buyer', copy: 'Source fresh produce for your business.' },
];

/** New accounts only. Agents, drivers and ops are invited by an administrator, so they aren't offered. */
export function RoleScreen() {
  const { reset } = useNav();
  const { colors } = useTheme();
  const s = useThemedStyles(styles);
  const [role, setRole] = useState<'farmer' | 'buyer' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = async () => {
    if (!role) return;
    setBusy(true);
    setError(null);
    try {
      await (role === 'farmer' ? createFarmer() : authService.completeBuyerOnboarding());
      reset(afterSignIn(toAccount((await authService.getProfile())!)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome! Who are you?" subtitle="You're verified. Choose how you'll use CryoChain. You can add your details inside the app.">
      {error ? <Banner text={error} /> : null}
      <View style={s.list}>
        {ROLES.map((r) => {
          const on = role === r.role;
          return (
            <Pressable key={r.role} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setRole(r.role)} style={[s.option, on && s.optionOn]}>
              <View style={[s.icon, on && s.iconOn]}>
                <Icon name={r.icon} size={24} color={on ? colors.onBrand : colors.brandInk} />
              </View>
              <View style={s.text}>
                <Text style={s.title}>{r.title}</Text>
                <Text style={s.copy}>{r.copy}</Text>
              </View>
              <View style={[s.radio, on && s.radioOn]}>{on ? <Icon name="check" size={14} color={colors.onBrand} strokeWidth={3} /> : null}</View>
            </Pressable>
          );
        })}
      </View>
      <Button label="Continue" size="lg" icon="arrowRight" loading={busy} disabled={!role} onPress={next} />
      <Text style={s.note}>Agents, drivers and operations staff join by invitation from an administrator.</Text>
    </AuthLayout>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  list: { gap: 12 },
  option: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, padding: 16, minHeight: 84, borderRadius: 16, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.surfaceCard },
  optionOn: { borderColor: c.brand600, backgroundColor: c.brandTint },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.brandTint },
  iconOn: { backgroundColor: c.brand600 },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.sansBold, fontSize: 17, color: c.ink },
  copy: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  radioOn: { borderColor: c.brand600, backgroundColor: c.brand600 },
  note: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: c.inkMuted, textAlign: 'center' as const },
});
