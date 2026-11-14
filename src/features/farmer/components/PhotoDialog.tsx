import React from 'react';
import { Image, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Button } from '../../../components/common';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

/** Tap-the-avatar dialog: large preview with change/add and remove actions. */
export function PhotoDialog({
  visible,
  uri,
  initials,
  busy,
  onClose,
  onPick,
  onRemove,
}: {
  visible: boolean;
  uri: string | null;
  initials: string;
  busy: boolean;
  onClose: () => void;
  onPick: () => void;
  onRemove: () => void;
}) {
  const s = useThemedStyles(styles);
  const size = Math.min(useWindowDimensions().width - 96, 300);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={s.scrim}
        onPress={onClose}
        accessibilityLabel="Close"
        accessibilityRole="button"
      >
        <Pressable style={s.card} onPress={() => {}} accessible={false}>
          <Text style={s.title}>Profile photo</Text>
          <View style={[s.frame, { width: size, height: size }]}>
            {uri ? (
              <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
            ) : (
              <Text style={s.initials}>{initials}</Text>
            )}
          </View>
          <Button
            label={uri ? 'Change photo' : 'Add photo'}
            icon="edit"
            onPress={() => {
              onClose();
              onPick();
            }}
            disabled={busy}
          />
          {uri ? (
            <Button
              label="Remove photo"
              variant="ghost"
              icon="trash"
              loading={busy}
              onPress={() => {
                onRemove();
                onClose();
              }}
            />
          ) : null}
          <Pressable onPress={onClose} accessibilityRole="button" style={s.done} hitSlop={8}>
            <Text style={s.doneText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 24,
  },
  card: {
    width: '100%' as const,
    maxWidth: 380,
    gap: 12,
    alignItems: 'stretch' as const,
    padding: 20,
    borderRadius: 28,
    backgroundColor: c.surfaceCard,
  },
  title: { fontFamily: fonts.sansBold, fontSize: 18, color: c.ink, textAlign: 'center' as const },
  frame: {
    alignSelf: 'center' as const,
    borderRadius: 28,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: c.brandTint,
  },
  initials: { fontFamily: fonts.heading, fontSize: 72, color: c.brandInk },
  done: { flexDirection: 'row' as const, alignSelf: 'center' as const, gap: 6, padding: 8 },
  doneText: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.inkMuted },
});
