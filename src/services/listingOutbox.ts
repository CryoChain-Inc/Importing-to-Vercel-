import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { readBytes, samePhoto, type PickedImage } from './catalogueImage';
import { MIN_PHOTOS } from './farmer.service';
import { isNetworkError } from './offlineCache';
import { requireUserId, supabase } from './supabase';

/**
 * Listings made on the phone, saved on the phone first and uploaded when there is signal.
 * Safe to retry any number of times: the listing id and photo paths are fixed when the listing is queued,
 * so a retry after a half-finished upload finds its own rows and files and carries on instead of duplicating them.
 */
export interface QueuedListing {
  id: string;
  farmerId: string;
  product: string;
  weightKg: number;
  grade: string;
  /** Copies kept in app storage, so the picker's cache being cleared cannot lose them. */
  photos: { uri: string; mimeType: string }[];
  createdAt: string;
  /** Set when the server refused the listing (not when the network is down). */
  error?: string;
}

const KEY = 'outbox:listings';
const BUCKET = 'produce';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

let items: QueuedListing[] = [];
let loaded: Promise<void> | null = null;
let flushing = false;
const listeners = new Set<() => void>();

const load = () => (loaded ??= AsyncStorage.getItem(KEY).then((raw) => { if (raw) items = JSON.parse(raw); }, () => undefined));
async function commit(next: QueuedListing[]) {
  items = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { load().then(l); listeners.add(l); return () => { listeners.delete(l); }; };
export const useOutbox = () => useSyncExternalStore(subscribe, () => items);

function uuid() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const folder = (id: string) => new Directory(Paths.document, 'outbox', id);
// expo-file-system has no web implementation, and the offline queue is for the phone app only.
const native = Platform.OS !== 'web';
const dropFolder = (id: string) => { if (native && folder(id).exists) folder(id).delete(); };

/** Validates, then on the phone copies the photos into app storage and queues the listing (works with no signal); on web uploads straight away. */
export async function enqueueListing(product: string, weightKg: number, grade: string, images: PickedImage[]): Promise<void> {
  if (images.length < MIN_PHOTOS) throw new Error(`Add at least ${MIN_PHOTOS} photos.`);
  if (images.some((img, i) => images.slice(0, i).some((earlier) => samePhoto(earlier, img)))) {
    throw new Error('Each photo has to be a different picture.');
  }
  if (images.some((img) => !EXT[img.mimeType ?? 'image/jpeg'])) throw new Error('Use JPEG, PNG or WebP photos.');
  const farmerId = await requireUserId();
  await load();
  const id = uuid();
  if (!native) {
    // Web has no safe place to keep photos across a reload, so it never queues: upload now or tell the farmer.
    const item = { id, farmerId, product: product.trim(), weightKg, grade, photos: images.map((img) => ({ uri: img.uri, mimeType: img.mimeType ?? 'image/jpeg' })), createdAt: new Date().toISOString() };
    let refused: string | null;
    try {
      refused = await send(item);
    } catch {
      throw new Error('No internet connection. Connect and try again.');
    }
    if (refused) throw new Error(refused);
    return;
  }
  const dir = folder(id);
  try {
    dir.create({ intermediates: true, idempotent: true });
    const photos = await Promise.all(images.map(async (img, i) => {
      const mimeType = img.mimeType ?? 'image/jpeg';
      const copy = new File(dir, `${i}.${EXT[mimeType]}`);
      await new File(img.uri).copy(copy, { overwrite: true });
      return { uri: copy.uri, mimeType };
    }));
    await commit([...items, { id, farmerId, product: product.trim(), weightKg, grade, photos, createdAt: new Date().toISOString() }]);
  } catch {
    if (dir.exists) dir.delete();
    throw new Error('Could not save the listing on this phone. Check there is free space and try again.');
  }
}

async function upload(item: QueuedListing): Promise<string[]> {
  const paths: string[] = [];
  for (const [i, p] of item.photos.entries()) {
    const path = `${item.farmerId}/${item.id}-${i}.${EXT[p.mimeType]}`;
    const body = await readBytes(p.uri);
    if (body.byteLength === 0) throw new Error('A photo could not be read. Pick it again.');
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: p.mimeType });
    // Already there from an earlier attempt that lost its reply.
    if (error && !/already exists|duplicate/i.test(error.message)) throw error;
    paths.push(path);
  }
  return paths;
}

const REFUSED = 'Could not add the listing. Check your farm address and MoMo wallet, and that the product has a published price.';

/** Uploads one listing. Resolves when it is on the server, throws a network error to stop the run, or returns the refusal text. */
async function send(item: QueuedListing): Promise<string | null> {
  let paths: string[];
  try {
    paths = await upload(item);
  } catch (e) {
    if (isNetworkError(e) || (e as { statusCode?: string })?.statusCode?.startsWith('5')) throw e;
    return 'Could not upload a photo (max 2 MB each).';
  }
  const { error, status } = await supabase
    .from('produce_listings')
    .insert({ id: item.id, farmer_id: item.farmerId, product: item.product, weight_kg: item.weightKg, grade: item.grade, image_paths: paths });
  if (!error || error.code === '23505') return null;
  if (status === 0 || status >= 500 || status === 408 || status === 429 || isNetworkError(error)) throw error;
  return REFUSED;
}

/** Sends every waiting listing in order. Stops quietly when the network is down. Returns how many reached the server. */
export async function flushOutbox(): Promise<number> {
  await load();
  if (flushing || !items.some((i) => !i.error)) return 0;
  flushing = true;
  let sent = 0;
  try {
    const me = await requireUserId();
    for (const item of items.filter((i) => !i.error && i.farmerId === me)) {
      const refused = await send(item);
      if (refused) {
        await commit(items.map((i) => (i.id === item.id ? { ...i, error: refused } : i)));
        continue;
      }
      await commit(items.filter((i) => i.id !== item.id));
      dropFolder(item.id);
      sent++;
    }
  } catch {
    // Offline or the server is busy: everything stays queued for the next attempt.
  } finally {
    flushing = false;
  }
  return sent;
}

/** Puts a refused listing back in line, e.g. after the farmer added their wallet. */
export async function retryQueued(id: string) {
  await load();
  await commit(items.map((i) => (i.id === id ? { ...i, error: undefined } : i)));
}

export async function discardQueued(id: string) {
  await load();
  const item = items.find((i) => i.id === id);
  await commit(items.filter((i) => i.id !== id));
  dropFolder(id);
  // A refused listing may already have photos on the server.
  if (item?.error) supabase.storage.from(BUCKET).remove(item.photos.map((p, i) => `${item.farmerId}/${id}-${i}.${EXT[p.mimeType]}`)).catch(() => undefined);
}

export const queuedCount = () => items.filter((i) => !i.error).length;
