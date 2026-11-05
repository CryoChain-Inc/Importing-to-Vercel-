import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers';

test('landing shows the sign-in card', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /log in or sign up|fresh from the farm/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await page.getByPlaceholder('24 123 4567').fill('200000001');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(errors).toEqual([]);
});

// Own number, so it doesn't share the per-number code-send limit with the role logins.
test('a wrong code is rejected', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('24 123 4567').fill('200000002');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('6-digit verification code').click();
  await page.keyboard.type('000000');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/code didn't work/i)).toBeVisible();
});

test('ops login rejects a bad password', async ({ page }) => {
  await page.goto('/ops');
  await expect(page.getByText('Operations sign in').first()).toBeVisible();
  await page.getByLabel('Work email').fill('tech@cryochain.co');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/do not match/i)).toBeVisible();
});
