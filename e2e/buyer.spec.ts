import { test } from '@playwright/test';
import { PHONES, signInWithPhone, trackErrors, visitTabs } from './helpers';

test('buyer signs in and opens every tab', async ({ page }) => {
  const errors = trackErrors(page);
  await signInWithPhone(page, PHONES.buyer);
  await visitTabs(page, ['Shop', 'Cart', 'Orders', 'Truck', 'Account', 'Shop'], errors);
});
