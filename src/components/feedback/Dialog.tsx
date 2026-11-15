import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Icon } from '../common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../theme';

/** Compact centered dialog for short forms; the keyboard lifts it and `footer` stays pinned. */
export function Dialog({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={s.card} accessibilityViewIsModal>
          <View style={s.head}>
            <View style={s.grow}>
              <Text style={s.title}>{title}</Text>
              {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={s.close}
            >
              <Icon name="close" size={18} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
            {children}
          </ScrollView>
          {footer ? <View style={s.foot}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 20 },
  scrim: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  card: {
    width: '100%' as const,
    maxWidth: 420,
    maxHeight: '90%' as const,
    borderRadius: 28,
    backgroundColor: c.surfaceCard,
    overflow: 'hidden' as const,
  },
  head: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    padding: 20,
    paddingBottom: 8,
  },
  grow: { flex: 1, gap: 4 },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
    color: c.ink,
  },
  sub: { fontFamily: fonts.sansRegular, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.surfaceSunken,
  },
  body: { padding: 20, paddingTop: 12 },
  foot: { padding: 20, paddingTop: 12 },
});
