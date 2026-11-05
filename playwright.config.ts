import { defineConfig, devices } from '@playwright/test';

// Tests run against the static web export (`npx expo export -p web` -> dist) and talk to the real Supabase backend from .env.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure', channel: 'chrome' },
  projects: [
    { name: 'mobile', testIgnore: /ops\.spec/, use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'desktop', testMatch: /(ops|public)\.spec\.ts/, use: { viewport: { width: 1360, height: 860 } } },
  ],
  webServer: { command: 'npx serve -s dist -l 4173', url: 'http://localhost:4173', reuseExistingServer: true },
});
