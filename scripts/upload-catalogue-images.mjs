import { createClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function loadEnvFile(file) {
  return readFile(file, 'utf8').then((contents) => {
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

await loadEnvFile(resolve(root, '.env'));
await loadEnvFile(resolve(root, '.env.local'));

const url = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY before uploading.');
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function imageFiles(folder, prefix) {
  const directory = resolve(root, 'assets/catalogue', folder);
  const files = await readdir(directory, { withFileTypes: true });
  return files.filter((file) => file.isFile() && file.name.endsWith('.jpg'))
    .map((file) => ({ path: resolve(directory, file.name), key: `${prefix}/${file.name}` }));
}

const assets = [
  ...await imageFiles('products', 'products'),
  ...await imageFiles('categories', 'categories'),
];
if (assets.length !== 526) {
  throw new Error(`Expected 520 product and 6 category images, found ${assets.length}. Run scripts/build-catalogue-images.py first.`);
}

let next = 0;
const failures = [];
async function worker() {
  while (next < assets.length) {
    const asset = assets[next++];
    const body = await readFile(asset.path);
    const { error } = await supabase.storage.from('catalogue').upload(asset.key, body, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: true,
    });
    if (error) failures.push(`${asset.key}: ${error.message}`);
  }
}

await Promise.all(Array.from({ length: 4 }, worker));
if (failures.length) {
  throw new Error(`Uploaded with ${failures.length} failure(s):\n${failures.join('\n')}`);
}
console.log(`Uploaded ${assets.length} catalogue images to the public catalogue bucket.`);
console.log('Next run supabase/seed/catalogue-images.sql in the Supabase SQL editor.');
