import { supabase } from './supabase';

const BUCKET = 'catalogue';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface PickedImage {
  uri: string;
  mimeType?: string | null;
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
