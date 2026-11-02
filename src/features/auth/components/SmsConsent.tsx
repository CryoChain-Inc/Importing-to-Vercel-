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
    <View style={s.row}>
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel="Agree to receive SMS messages from CryoChain"
        hitSlop={8}
        style={[s.box, checked && s.boxOn]}
      >
        {checked ? <Icon name="check" size={14} color={colors.surfaceCard} strokeWidth={3} /> : null}
      </Pressable>
      <Text style={s.text}>
        Optional: I agree to get SMS pickup alerts from CryoChain. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.{' '}
        <Text accessibilityRole="link" style={s.link} onPress={() => Linking.openURL(`${SITE}/terms.html`)}>Terms</Text>
        {' · '}
        <Text accessibilityRole="link" style={s.link} onPress={() => Linking.openURL(`${SITE}/privacy.html`)}>Privacy</Text>
      </Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  row: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10 },
  box: { width: 22, height: 22, marginTop: 1, borderRadius: 6, borderWidth: 1.5, borderColor: c.borderStrong, alignItems: 'center' as const, justifyContent: 'center' as const },
  boxOn: { backgroundColor: c.brand600, borderColor: c.brand600 },
  text: { flex: 1, fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 17, color: c.inkMuted },
  link: { fontFamily: fonts.sansMedium, color: c.brandInk, textDecorationLine: 'underline' as const },
});
