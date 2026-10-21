import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Button, Icon } from '../../../components/common';
import type { PickedImage } from '../../../services/catalogueImage';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

/** Preview of the current or newly picked image with a remove button; the parent uploads or deletes on save. */
export function ImageField({ label, currentUrl, picked, removed, onPick, onRemove }: {
  label: string;
  currentUrl: string | null;
  picked?: PickedImage;
  /** The saved image is marked for removal on save. */
  removed?: boolean;
  onPick: (img: PickedImage) => void;
  onRemove: () => void;
}) {
  const s = useThemedStyles(styles);
  const uri = picked?.uri ?? (removed ? null : currentUrl);

  const choose = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!r.canceled) onPick({ uri: r.assets[0].uri, mimeType: r.assets[0].mimeType });
  };

  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        <View style={s.tile}>
          {uri ? (
            <>
              <Image source={{ uri }} style={s.thumb} accessibilityLabel={`${label} preview`} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()}`} hitSlop={6} onPress={onRemove} style={s.remove}>
                <Icon name="close" size={14} color="#ffffff" />
              </Pressable>
            </>
          ) : (
            <View style={[s.thumb, s.empty]}><Icon name="camera" size={24} color="#8a948e" /></View>
          )}
        </View>
        <View style={s.grow}>
          <Button label={uri ? 'Change image' : 'Add image'} variant="outline" size="sm" onPress={choose} />
          <Text style={s.meta}>
            {picked ? 'New image, saved with the form.' : removed ? 'Image will be removed when you save.' : uri ? 'Current image.' : 'JPEG, PNG or WebP, up to 2 MB.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 8 },
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  grow: { flex: 1, gap: 6, alignItems: 'flex-start' as const },
  tile: { width: 104, height: 104 },
  thumb: { width: 104, height: 104, borderRadius: 14, backgroundColor: c.surfaceSunken },
  remove: { position: 'absolute' as const, top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(0,0,0,0.65)' },
  empty: { alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: c.borderStrong },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 16, color: c.inkMuted },
});
