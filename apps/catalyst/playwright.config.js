import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  // One worker, in file order: a few specs change data (scoring, completion
  // decisions) that others assert exact figures on. The suite re-seeds first.
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Writes a storageState file per role before any e2e spec runs.
    { name: 'setup', testMatch: /auth\.setup\.js/ },

    {
      name: 'axe',
      testMatch: /axe\.spec\.js/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'e2e',
      testMatch: /(?<!axe)(?<!auth\.setup)\.spec\.js$/,
      testIgnore: /mobile\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },

    // A phone-sized viewport for the pages students use.
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.js$/,
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: `npx vite --mode test --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    // Production-like: the portal forwards the bare APP_DOMAIN (`localhost` under
    // apps/api/.env.test) as the API Host, so the API treats it as the
    // general-portal host and takes the tenant from the token claim.
    env: { PORTAL_API_HOST: 'localhost', VITE_APP_DOMAIN: 'localhost' },
  },
});
