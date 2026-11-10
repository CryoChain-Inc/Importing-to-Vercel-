import { expect, test } from '@playwright/test';
import { signInOps, trackErrors } from './helpers';

const SECTIONS: [label: string, path: string][] = [
  ['Dashboard', 'dashboard'], ['Supply', 'supply'], ['Farmers', 'farmers'], ['Buyers', 'buyers'], ['Orders', 'orders'],
  ['Decisions', 'decisions'], ['Payments in', 'payments'], ['Farmer payouts', 'payouts'], ['Routes', 'routes'],
  ['Cold trucks', 'trucks'], ['Prices and products', 'prices'], ['Team', 'team'], ['Settings', 'settings'],
];

test('ops signs in and opens every section', async ({ page }) => {
  const errors = trackErrors(page);
  await signInOps(page);
  for (const [label, path] of SECTIONS) {
    const t = page.getByRole('tab', { name: new RegExp(`^${label}`) }).first();
    await t.click();
    await expect(page).toHaveURL(new RegExp(`/ops/${path}`));
    await page.waitForLoadState('networkidle');
  }
  expect(errors).toEqual([]);
});
