import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Icon } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';
import { SITE } from './AccountFooter';

/** Unchecked-by-default SMS consent. Carriers (A2P 10DLC review) need this wording shown beside the phone field. */
export function SmsConsent({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <View style={s.wrap}>
    <Text style={s.fine}>
      Signing in sends a one-time verification code from CryoChain by SMS. This is required for login and is not a marketing message. Message & data rates may apply.
    </Text>
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel="Agree to receive SMS messages from CryoChain about your orders"
      hitSlop={6}
      style={s.row}
    >
      <View style={[s.box, checked && s.boxOn]}>
        {checked ? <Icon name="check" size={11} color={colors.surfaceCard} strokeWidth={3} /> : null}
      </View>
      <Text style={s.fine}>
        Text me order updates (optional). Frequency varies, rates may apply. Reply STOP to opt out.{' '}
        <Text accessibilityRole="link" style={s.link} onPress={() => Linking.openURL(`${SITE}/terms.html`)}>Terms</Text>
        {' · '}
        <Text accessibilityRole="link" style={s.link} onPress={() => Linking.openURL(`${SITE}/privacy.html`)}>Privacy Policy</Text>
      </Text>
    </Pressable>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 10 },
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8 },
  box: { width: 16, height: 16, marginTop: 1, borderRadius: 4, borderWidth: 1.5, borderColor: c.borderStrong, backgroundColor: c.surfaceCard, alignItems: 'center' as const, justifyContent: 'center' as const },
  boxOn: { backgroundColor: c.brand600, borderColor: c.brand600 },
  fine: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: c.inkMuted },
  link: { fontFamily: fonts.sansMedium, color: c.brandInk, textDecorationLine: 'underline' as const },
});
