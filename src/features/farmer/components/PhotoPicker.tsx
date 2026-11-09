import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Button, Icon } from '../../../components/common';
import { imageFingerprint, samePhoto, type PickedImage } from '../../../services/catalogueImage';
import { MAX_PHOTOS, MIN_PHOTOS } from '../../../services/farmer.service';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

async function toPicked(a: ImagePicker.ImagePickerAsset): Promise<PickedImage> {
  return {
    uri: a.uri,
    mimeType: a.mimeType,
    assetId: a.assetId,
    fingerprint: await imageFingerprint(a.uri),
  };
}

/** Take a photo or choose from the library; preview each photo and remove with ×. The same picture cannot be added twice. */
export function PhotoPicker({ value, onChange }: { value: PickedImage[]; onChange: (v: PickedImage[]) => void }) {
  const s = useThemedStyles(styles);
  const [duplicate, setDuplicate] = useState(false);
  const room = MAX_PHOTOS - value.length;
  const add = async (r: ImagePicker.ImagePickerResult) => {
    if (r.canceled) return;
    const next = [...value];
    let skipped = false;
    for (const asset of r.assets) {
      if (next.length >= MAX_PHOTOS) break;
      const img = await toPicked(asset);
      if (next.some((have) => samePhoto(have, img))) {
        skipped = true;
        continue;
      }
      next.push(img);
    }
    setDuplicate(skipped);
    onChange(next);
  };

  const camera = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (granted) await add(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 }));
  };
  const library = async () =>
    add(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 0.6 }));

  return (
    <View style={s.wrap}>
      <Text style={s.label}>Photos ({value.length}/{MAX_PHOTOS}, at least {MIN_PHOTOS})</Text>
      <View style={s.row}>
        {value.map((img, i) => (
          <View key={img.uri} style={s.tile}>
            <Image source={{ uri: img.uri }} style={s.thumb} accessibilityLabel={`Photo ${i + 1} preview`} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} hitSlop={6} onPress={() => { setDuplicate(false); onChange(value.filter((_, j) => j !== i)); }} style={s.remove}>
              <Icon name="close" size={14} color="#ffffff" />
            </Pressable>
          </View>
        ))}
      </View>
      <View style={s.row}>
        <Button label="Take photo" variant="outline" size="sm" onPress={camera} disabled={room <= 0} />
        <Button label="Upload" variant="outline" size="sm" onPress={library} disabled={room <= 0} />
      </View>
      {duplicate ? <Text style={s.warn}>That photo is already added. Choose a different one.</Text> : null}
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  wrap: { gap: 8 },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  tile: { width: 104, height: 104 },
  thumb: { width: 104, height: 104, borderRadius: 14, backgroundColor: c.surfaceSunken },
  remove: { position: 'absolute' as const, top: 6, right: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: 'rgba(0,0,0,0.65)' },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 12, color: c.inkMuted },
  warn: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 18, color: c.dangerInk },
});
