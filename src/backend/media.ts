import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { remoteEnabled } from './config';
import { supabase } from './client';

export async function capturePhoto(label: string): Promise<string | null> {
  // Offline prototype fallback allows full UI testing without Supabase storage.
  if (!remoteEnabled) return label;
  const camera = await ImagePicker.requestCameraPermissionsAsync();
  // Native requires base64 extraction to construct binary payloads; web can fetch asset.uri directly.
  const shot = camera.granted
    ? await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        base64: Platform.OS !== 'web',
      })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        base64: Platform.OS !== 'web',
      });
  if (shot.canceled || !shot.assets[0]) return null;
  const asset = shot.assets[0];
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  // Prefix path with user ID to satisfy Supabase storage row-level security policies.
  const path = `${uid}/${label}-${Date.now()}.jpg`;
  const body = asset.base64
    ? base64Bytes(asset.base64)
    : await (await fetch(asset.uri)).arrayBuffer();
  const { error } = await supabase.storage
    .from('captures')
    .upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) return null;
  return `${label}:${path}`;
}

function base64Bytes(value: string) {
  const bin = globalThis.atob(value);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function shotDone(photos: string[], label: string) {
  return photos.some((photo) => photo === label || photo.startsWith(`${label}:`));
}

export async function readPosition(): Promise<{ lat: number; lng: number; at: number } | null> {
  if (!remoteEnabled) return null;
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') return null;
  // Use Balanced accuracy (~100m) to preserve mobile battery during all-day transit runs.
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() };
}
