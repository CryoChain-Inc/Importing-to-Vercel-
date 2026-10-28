import { supabase } from './supabase';

const BUCKET = 'catalogue';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface PickedImage {
  uri: string;
  mimeType?: string | null;
  /** Stable id from the photo library, when the device provides one. */
  assetId?: string | null;
  /** Hash of the file bytes, so the same picture is recognised even with a new address. */
  fingerprint?: string | null;
}

/** True when both picks are the same picture: the same library item, or the same file bytes. */
export function samePhoto(a: PickedImage, b: PickedImage): boolean {
  if (a.uri && a.uri === b.uri) return true;
  if (a.assetId && b.assetId && a.assetId === b.assetId) return true;
  if (a.fingerprint && b.fingerprint && a.fingerprint === b.fingerprint) return true;
  return false;
}

/** Content hash used to spot a repeated upload. Falls back to a checksum when SHA-256 is unavailable. */
export async function imageFingerprint(uri: string): Promise<string | null> {
  try {
    const body = await (await fetch(uri)).arrayBuffer();
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
      const digest = new Uint8Array(await subtle.digest('SHA-256', body));
      return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    const bytes = new Uint8Array(body);
    let hash = 2166136261;
    for (let i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 16777619);
    }
    return `${bytes.length}:${hash >>> 0}`;
  } catch {
    return null;
  }
}

/** Public URL for a stored image; null when the item has none. */
export const imageUrl = (path: string | null | undefined) =>
  path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;

/**
 * Uploads to a fresh path (so cached copies of the old image never show) and removes the old file.
 * Returns the new path to store on the row.
 */
export async function replaceImage(kind: 'categories' | 'products', id: string, img: PickedImage, oldPath?: string | null) {
  const type = img.mimeType ?? 'image/jpeg';
  const ext = EXT[type];
  if (!ext) throw new Error('Use a JPEG, PNG or WebP image.');
  const body = await (await fetch(img.uri)).arrayBuffer();
  const path = `${kind}/${id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: type });
  if (error) throw new Error('Could not upload the image (max 2 MB).');
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
  return path;
}

export async function removeStoredImage(path: string) {
  await supabase.storage.from(BUCKET).remove([path]);
}
