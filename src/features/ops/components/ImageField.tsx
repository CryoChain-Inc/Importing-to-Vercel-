import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Image, Text, View } from 'react-native';
import { Button } from '../../../components/common';
import type { PickedImage } from '../../../services/catalogueImage';
import { fonts, useThemedStyles, type ColorToken } from '../../../theme';

/** Shows the current or newly picked image; the parent uploads it on save. */
export function ImageField({ label, currentUrl, picked, onPick }: {
  label: string;
  currentUrl: string | null;
  picked?: PickedImage;
  onPick: (img: PickedImage) => void;
}) {
  const s = useThemedStyles(styles);
  const uri = picked?.uri ?? currentUrl;

  const choose = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!r.canceled) onPick({ uri: r.assets[0].uri, mimeType: r.assets[0].mimeType });
  };

  return (
    <View style={s.row}>
      {uri ? <Image source={{ uri }} style={s.thumb} accessibilityLabel={label} /> : <View style={[s.thumb, s.empty]}><Text style={s.meta}>No image</Text></View>}
      <View style={s.grow}>
        <Text style={s.label}>{label}</Text>
        <Button label={uri ? 'Change image' : 'Add image'} variant="outline" size="sm" onPress={choose} />
      </View>
    </View>
  );
}

const styles = (c: Record<ColorToken, string>) => ({
  row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  grow: { flex: 1, gap: 6 },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: c.surfaceSunken },
  empty: { alignItems: 'center' as const, justifyContent: 'center' as const },
  label: { fontFamily: fonts.sansSemiBold, fontSize: 13, color: c.ink },
  meta: { fontFamily: fonts.sansRegular, fontSize: 11, color: c.inkMuted },
});
