import { expect, type Page } from '@playwright/test';

export const CODE = '123456';
export const PHONES = { farmer: '200000001', buyer: '200000006', driver: '200000004' } as const;
export const OPS = { email: 'tech@cryochain.co', password: 'cryochain' };

/** Phone + one-time code sign-in from the landing page (Ghana is the default country). */
export async function signInWithPhone(page: Page, national: string) {
  await page.goto('/');
  await page.getByPlaceholder('24 123 4567').fill(national);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/6-digit code/i).first()).toBeVisible();
  await page.getByLabel('6-digit verification code').click();
  await page.keyboard.type(CODE);
  await page.getByRole('button', { name: 'Confirm' }).click();
  // First sign-in on a fresh browser shows a welcome dialog that blocks the tabs.
  await page.getByRole('button', { name: 'Get started' }).click({ timeout: 8000 }).catch(() => undefined);
}

export async function signInOps(page: Page) {
  await page.goto('/ops');
  await page.getByLabel('Work email').fill(OPS.email);
  await page.getByLabel('Password', { exact: true }).fill(OPS.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Get started' }).click({ timeout: 8000 }).catch(() => undefined);
}

/** Bottom/side tab by its visible label. */
export const tab = (page: Page, name: string) => page.getByRole('tab', { name }).or(page.getByRole('button', { name, exact: true })).first();

/** Collects uncaught page errors so every visited screen is also checked for crashes. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Opens each tab in turn (selected state isn't exposed to the browser yet: accessibilityState is ignored by react-native-web). */
export async function visitTabs(page: Page, names: string[], errors: string[]) {
  for (const name of names) {
    const t = page.getByRole('tab', { name, exact: true }).first();
    await t.click();
    await page.waitForLoadState('networkidle');
  }
  expect(errors).toEqual([]);
}
