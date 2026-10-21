import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Button, Icon } from '../../../components/common';
import type { PickedImage } from '../../../services/catalogueImage';
import { MAX_PHOTOS, MIN_PHOTOS } from '../../../services/farmer.service';
import { fonts, useTheme, useThemedStyles, type ColorToken } from '../../../theme';

/** Take a photo or choose from the library; preview each photo and remove with ×. */
export function PhotoPicker({ value, onChange }: { value: PickedImage[]; onChange: (v: PickedImage[]) => void }) {
  const s = useThemedStyles(styles);
  const { colors } = useTheme();
  const room = MAX_PHOTOS - value.length;
  const add = (r: ImagePicker.ImagePickerResult) => {
    if (!r.canceled) onChange([...value, ...r.assets.map((a) => ({ uri: a.uri, mimeType: a.mimeType }))].slice(0, MAX_PHOTOS));
  };

  const camera = async () => {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (granted) add(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 }));
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
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} hitSlop={6} onPress={() => onChange(value.filter((_, j) => j !== i))} style={s.remove}>
              <Icon name="close" size={14} color="#ffffff" />
            </Pressable>
          </View>
        ))}
      </View>
      <View style={s.row}>
        <Button label="Take photo" variant="outline" size="sm" onPress={camera} disabled={room <= 0} />
        <Button label="Upload" variant="outline" size="sm" onPress={library} disabled={room <= 0} />
      </View>
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
});
