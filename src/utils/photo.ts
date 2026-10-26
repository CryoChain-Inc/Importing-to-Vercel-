import * as ImagePicker from 'expo-image-picker';

export interface Photo {
  uri: string;
  mime: string;
}

/** Camera first; falls back to the photo library where there is no camera (desktop browsers). */
export async function takePhoto(): Promise<Photo | null> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.granted) {
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4 });
      if (shot.canceled || !shot.assets[0]) return null;
      return { uri: shot.assets[0].uri, mime: shot.assets[0].mimeType ?? 'image/jpeg' };
    }
  } catch {
    // No camera here. The photo library covers it.
  }
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4 });
  if (picked.canceled || !picked.assets[0]) return null;
  return { uri: picked.assets[0].uri, mime: picked.assets[0].mimeType ?? 'image/jpeg' };
}

/** File bytes for a storage upload. A Blob from a local file URI uploads as zero bytes on Android, so send an ArrayBuffer. */
export const photoBytes = async (uri: string) => (await fetch(uri)).arrayBuffer();
