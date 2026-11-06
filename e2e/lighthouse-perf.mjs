// Performance audit of the SIGNED-IN home of every role, on mobile and desktop.
// Usage: npm run lh:perf [role...]   (needs `npx expo export -p web` first; serves dist itself)
// Each role signs in through a throwaway Chrome profile that Lighthouse then reuses (storage reset off), so it loads the real screen, not the login page.
import { chromium } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = 'http://localhost:4175';
const CODE = '123456';
const ROLES = { farmer: '200000001', buyer: '200000006', driver: '200000004', ops: null };
const wanted = process.argv.slice(2);
const roles = Object.entries(ROLES).filter(([r]) => !wanted.length || wanted.includes(r));
const OUT = '.lighthouseci/perf';
mkdirSync(OUT, { recursive: true });

async function signIn(page, phone) {
  if (!phone) {
    await page.goto(`${BASE}/ops`);
    await page.getByLabel('Work email').fill('tech@cryochain.co');
    await page.getByLabel('Password', { exact: true }).fill('cryochain');
    await page.getByRole('button', { name: 'Sign in' }).click();
  } else {
    await page.goto(BASE);
    await page.getByPlaceholder('24 123 4567').fill(phone);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('6-digit verification code').click();
    await page.keyboard.type(CODE);
    await page.getByRole('button', { name: 'Confirm' }).click();
  }
  await page.getByRole('button', { name: 'Get started' }).click({ timeout: 8000 }).catch(() => undefined);
  await page.getByRole('tab').first().waitFor({ timeout: 20000 }).catch(() => undefined); // ops uses links, not tabs
  await page.waitForLoadState('networkidle');
}

const server = spawn('npx', ['serve', '-s', 'dist', '-l', '4175'], { stdio: 'ignore', timeout: 240000 });
await new Promise((r) => setTimeout(r, 3000));
const rows = [];

try {
  for (const [role, phone] of roles) {
    const profile = mkdtempSync(join(tmpdir(), 'lh-'));
    const ctx = await chromium.launchPersistentContext(profile, {
      channel: 'chrome',
      viewport: role === 'ops' ? { width: 1360, height: 860 } : { width: 412, height: 915 },
    });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await signIn(page, phone);
    const url = page.url();
    await ctx.close(); // flushes the session to the profile; Lighthouse then launches its own Chrome on it, so two clients never drive one browser
    for (const device of ['mobile', 'desktop']) {
      const file = `${OUT}/${role}-${device}.json`;
      const preset = device === 'desktop' ? ['--preset=desktop'] : [];
      execFileSync('npx', ['--yes', 'lighthouse', url, `--chrome-flags=--headless=new --user-data-dir=${profile}`, '--disable-storage-reset', '--only-categories=performance', '--output=json', `--output-path=${file}`, '--quiet', ...preset], { stdio: 'ignore', timeout: 240000 });
      const r = JSON.parse(readFileSync(file, 'utf8'));
      const a = r.audits;
      // A run that landed on a sign-in screen would score high and mean nothing; a signed-in page always hits Supabase.
      const signedIn = a['network-requests'].details.items.some((i) => i.url.includes('/rest/v1/'));
      rows.push(
        `${role.padEnd(7)} ${device.padEnd(8)} ${String(Math.round(r.categories.performance.score * 100)).padStart(3)}  FCP ${a['first-contentful-paint'].displayValue}  LCP ${a['largest-contentful-paint'].displayValue}  TBT ${a['total-blocking-time'].displayValue}  final ${r.finalDisplayedUrl.replace(BASE, '')}${signedIn ? '' : '  NOT SIGNED IN: ignore this row'}`,
      );
    }
  }
} finally {
  server.kill();
}
console.log(rows.join('\n'));
