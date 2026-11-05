import React from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Icon } from '../../../components/common';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

/** Dialog on wide screens, bottom sheet on phones. Body scrolls; `footer` stays pinned. */
export function Sheet({ title, subtitle, onClose, footer, children }: { title: string; subtitle?: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const wide = useWindowDimensions().width >= 720;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.root, wide && s.rootWide]}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.panel, wide ? s.panelWide : s.panelSheet]} accessibilityViewIsModal>
          <View style={s.head}>
            <View style={s.grow}>
              <Text style={s.title} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={s.sub} numberOfLines={2}>{subtitle}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose} style={s.close}>
              <Icon name="close" size={18} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={s.foot}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  root: { flex: 1, justifyContent: 'flex-end' as const },
  rootWide: { justifyContent: 'center' as const, alignItems: 'center' as const, padding: 24 },
  backdrop: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(10,20,14,0.55)' },
  panel: { backgroundColor: c.surfaceCard, overflow: 'hidden' as const, borderWidth: 1, borderColor: c.borderSubtle },
  panelWide: { width: '100%' as const, maxWidth: 600, maxHeight: '90%' as const, borderRadius: 24 },
  panelSheet: { maxHeight: '92%' as const, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  head: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  grow: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.heading, fontSize: 22, letterSpacing: -0.3, color: c.ink },
  sub: { fontFamily: fonts.sansRegular, fontSize: 13, color: c.inkMuted },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: c.surfaceSunken },
  body: { padding: 20, gap: 16 },
  foot: { flexDirection: 'row' as const, justifyContent: 'flex-end' as const, flexWrap: 'wrap' as const, gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.borderSubtle, backgroundColor: c.surfaceCard },
});
