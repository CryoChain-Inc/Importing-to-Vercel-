// Lighthouse snapshot (no reload) audits of the signed-in screens, which a URL-based run can't reach.
// Usage: npm run lh:roles   (needs `npx expo export -p web` first; serves dist itself)
import { chromium } from '@playwright/test';
import puppeteer from 'puppeteer-core';
import { startFlow } from 'lighthouse';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const BASE = 'http://localhost:4175';
const PORT = 9333;
const CODE = '123456';
const ROLES = {
  farmer: { phone: '200000001', tabs: ['Listings', 'Messages', 'Payments', 'Profile'] },
  buyer: { phone: '200000006', tabs: ['Shop', 'Cart', 'Orders', 'Truck', 'Account'] },
  driver: { phone: '200000004', tabs: ['Home', 'Cold truck', 'Delivery'] },
  ops: { tabs: ['Dashboard', 'Supply', 'Farmers', 'Buyers', 'Orders', 'Decisions', 'Payments in', 'Farmer payouts', 'Routes', 'Cold trucks', 'Prices and products', 'Team', 'Settings'] },
};

const server = spawn('npx', ['serve', '-s', 'dist', '-l', '4175'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 3000));
mkdirSync('.lighthouseci/roles', { recursive: true });
const rows = [];

for (const [role, { phone, tabs }] of Object.entries(ROLES)) {
  const browser = await chromium.launch({ channel: 'chrome', args: [`--remote-debugging-port=${PORT}`] });
  const page = await (await browser.newContext(role === 'ops' ? { viewport: { width: 1360, height: 860 } } : { viewport: { width: 412, height: 915 } })).newPage();
  if (role === 'ops') {
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

  const pp = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const target = (await pp.pages()).find((p) => p.url().startsWith(BASE));
  const flow = await startFlow(target, { config: { extends: 'lighthouse:default', settings: { onlyCategories: ['accessibility', 'best-practices'] } } });
  for (const name of tabs) {
    await page.getByRole('tab', { name: new RegExp(`^${name}`) }).first().click();
    await page.waitForLoadState('networkidle');
    await flow.snapshot({ name: `${role} / ${name}` });
  }
  const flowResult = await flow.createFlowResult();
  writeFileSync(`.lighthouseci/roles/${role}.json`, JSON.stringify(flowResult));
  writeFileSync(`.lighthouseci/roles/${role}.html`, await flow.generateReport());
  for (const s of flowResult.steps) {
    const sc = Object.fromEntries(Object.entries(s.lhr.categories).map(([k, v]) => [k.replace('best-practices', 'bp').replace('accessibility', 'a11y'), Math.round(v.score * 100)]));
    rows.push(`${s.name.padEnd(32)} a11y ${sc.a11y}  best-practices ${sc.bp}`);
  }
  await pp.disconnect();
  await browser.close();
}
console.log(rows.join('\n'));
server.kill();
