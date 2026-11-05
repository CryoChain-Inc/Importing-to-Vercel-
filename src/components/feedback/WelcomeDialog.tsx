import React from 'react';
import { Modal, Text, View } from 'react-native';
import { Button, Icon } from '../common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';

/** One-time greeting after a user's first sign-in or sign-up. Modal works on Android, iOS and web. */
export function WelcomeDialog({ name, onClose }: { name: string; onClose: () => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.scrim}>
        <View style={s.card} accessibilityViewIsModal>
          <View style={s.badge}><Icon name="leaf" size={28} color={colors.onBrand} /></View>
          <Text style={s.title}>Welcome to CryoChain{name ? `, ${name}` : ''}!</Text>
          <Text style={s.copy}>Your account is ready. Fresh produce, fair prices, one place.</Text>
          <Button label="Get started" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 } as const,
  card: { width: '100%', maxWidth: 380, backgroundColor: c.surfaceCard, borderRadius: 24, padding: 24, gap: 12, alignItems: 'stretch' } as const,
  badge: { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: c.brand600, alignItems: 'center', justifyContent: 'center' } as const,
  title: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: c.ink, textAlign: 'center' } as const,
  copy: { fontFamily: fonts.sansRegular, fontSize: 15, lineHeight: 22, color: c.inkMuted, textAlign: 'center', marginBottom: 8 } as const,
});
