import { expect, test } from '@playwright/test';
import { PHONES, signInWithPhone, trackErrors, visitTabs } from './helpers';

test('farmer signs in and opens every tab', async ({ page }) => {
  const errors = trackErrors(page);
  await signInWithPhone(page, PHONES.farmer);
  await expect(page.getByText("Today's prices")).toBeVisible();
  await visitTabs(page, ['Messages', 'Payments', 'Profile', 'Listings'], errors);
});

test('farmer can open the new listing form', async ({ page }) => {
  await signInWithPhone(page, PHONES.farmer);
  await page.getByRole('button', { name: 'New listing' }).first().click();
  await expect(page.getByText(/new listing/i).first()).toBeVisible();
});
