import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'cache:';

/** Network failures only. A server that answered with an error is a real error and must not be hidden by old data. */
export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: string } | null)?.message ?? e ?? '');
  return e instanceof TypeError || /network|failed to fetch|timed? ?out|offline|econn|abort|load failed/i.test(msg);
}

/** Runs `load`, saves what it returned, and serves the last saved copy when the device cannot reach the server. */
export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const value = await load();
    AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => undefined);
    return value;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const saved = await AsyncStorage.getItem(PREFIX + key).catch(() => null);
    if (saved == null) throw e;
    return JSON.parse(saved) as T;
  }
}

/** Called on sign-out so the next person on this phone never sees the last farmer's data. */
export async function clearOfflineCache() {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  await AsyncStorage.multiRemove(keys);
}
