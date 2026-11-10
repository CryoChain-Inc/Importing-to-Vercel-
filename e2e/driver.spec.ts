import { test } from '@playwright/test';
import { PHONES, signInWithPhone, trackErrors, visitTabs } from './helpers';

test('driver signs in and opens every tab', async ({ page }) => {
  const errors = trackErrors(page);
  await signInWithPhone(page, PHONES.driver);
  await visitTabs(page, ['Cold truck', 'Delivery', 'Home'], errors);
});
