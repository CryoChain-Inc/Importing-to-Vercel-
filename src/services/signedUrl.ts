import { supabase } from './supabase';

const TTL = 60 * 60;
const REUSE_MS = 50 * 60 * 1000; // under the URL lifetime, so a reused URL never expires on screen
const cache = new Map<string, { at: number; url: Promise<string | null> }>();
const batches = new Map<string, { paths: Set<string>; run: Promise<Map<string, string>> }>();

/** Signed URL for a private file. Calls in the same tick share one request and results are reused, so the image URL stays stable and cacheable. */
export function signedUrl(bucket: string, path: string | null | undefined): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.url;

  let batch = batches.get(bucket);
  if (!batch) {
    const paths = new Set<string>();
    const run = Promise.resolve().then(async () => {
      batches.delete(bucket);
      const { data } = await supabase.storage.from(bucket).createSignedUrls([...paths], TTL);
      return new Map(
        (data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl]] : [])) as [
          string,
          string,
        ][],
      );
    });
    batch = { paths, run };
    batches.set(bucket, batch);
  }
  batch.paths.add(path);
  const url = batch.run.then((m) => m.get(path) ?? null).catch(() => null);
  cache.set(key, { at: Date.now(), url });
  void url.then((u) => u ?? cache.delete(key)); // never keep a failure
  return url;
}
