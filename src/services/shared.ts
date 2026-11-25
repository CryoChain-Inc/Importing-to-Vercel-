const hits = new Map<string, { at: number; value: Promise<unknown> }>();

/** Callers of the same read within `ms` share one request; a failure is never kept. */
export function shared<T>(key: string, ms: number, load: () => Promise<T>): Promise<T> {
  const hit = hits.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value as Promise<T>;
  const value = load();
  hits.set(key, { at: Date.now(), value });
  value.catch(() => hits.delete(key));
  return value;
}
