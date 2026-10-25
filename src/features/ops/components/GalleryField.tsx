import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Icon } from '../../../components/common';
import { imageUrl, type PickedImage } from '../../../services/catalogueImage';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

export const GALLERY_MAX = 8;

/** Extra product photos: saved ones (by path) and newly picked ones; the parent uploads and deletes on save. */
export function GalleryField({ saved, picked, onChange }: {
  saved: string[];
  picked: PickedImage[];
  onChange: (next: { saved: string[]; picked: PickedImage[] }) => void;
}) {
  const s = useThemedStyles(styles);
  const room = GALLERY_MAX - saved.length - picked.length;

  const choose = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 0.7 });
    if (r.canceled) return;
    const next = r.assets.slice(0, room).map((a) => ({ uri: a.uri, mimeType: a.mimeType }));
    onChange({ saved, picked: [...picked, ...next] });
  };

  const tile = (key: string, uri: string, onRemove: () => void) => (
    <View key={key} style={s.tile}>
      <Image source={{ uri }} style={s.thumb} accessibilityLabel="Product photo" />
      <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={6} onPress={onRemove} style={s.remove}>
        <Icon name="close" size={14} color="#ffffff" />
      </Pressable>
    </View>
  );

  return (
    <View style={s.wrap}>
      <Text style={s.label}>More photos</Text>
      {saved.length + picked.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
          {saved.map((p) => tile(p, imageUrl(p)!, () => onChange({ saved: saved.filter((x) => x !== p), picked })))}
          {picked.map((p, i) => tile(p.uri, p.uri, () => onChange({ saved, picked: picked.filter((_, j) => j !== i) })))}
        </ScrollView>
      ) : null}
      <Button label="Add photos" variant="outline" size="sm" icon="camera" disabled={room <= 0} onPress={choose} />
      <Text style={s.meta}>{room > 0 ? `Buyers swipe through these on the product page. Up to ${GALLERY_MAX}, 2 MB each.` : `Photo limit reached (${GALLERY_MAX}).`}</Text>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 8, alignItems: 'flex-start' as const },
  row: { gap: 10 },
  tile: { width: 88, height: 88 },
  thumb: { width: 88, height: 88, borderRadius: 14, backgroundColor: c.surfaceSunken },
  remove: { position: 'absolute' as const, top: 5, right: 5, width: 24, height: 24, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(0,0,0,0.65)' },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 12, lineHeight: 16, color: c.inkMuted },
});
