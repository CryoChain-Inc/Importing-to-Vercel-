import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

/** Full-screen editor with a pinned Save bar, so long forms never push the buttons off screen. */
export function EditSheet({ visible, title, onClose, onSave, saveLabel, busy, canSave, children }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
  busy: boolean;
  canSave: boolean;
  children: React.ReactNode;
}) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.page}>
        <View style={s.bar}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={s.close}>
            <Icon name="close" size={20} color={colors.ink} />
          </Pressable>
          <Text style={s.title}>{title}</Text>
        </View>
        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          <View style={s.footer}>
            <Button label={saveLabel} onPress={onSave} loading={busy} disabled={!canSave} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  page: { flex: 1, backgroundColor: c.bgApp },
  flex: { flex: 1 },
  bar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 20, paddingVertical: 8 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceCard },
  title: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, letterSpacing: -0.3, color: c.ink },
  body: { padding: 20, paddingBottom: 32, width: '100%' as const, maxWidth: 560, alignSelf: 'center' as const },
  footer: { padding: 16, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: c.surfaceSunken, backgroundColor: c.bgApp },
});
