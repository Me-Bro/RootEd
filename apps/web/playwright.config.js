import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Creates storageState auth files before any e2e tests run
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
      use: { baseURL: 'http://127.0.0.1:5173' },
    },

    // Accessibility (existing) — against dev server
    {
      name: 'axe',
      testMatch: /axe\.spec\.js/,
      use: { baseURL: 'http://127.0.0.1:5173' },
    },

    // E2E tests — default role is super_admin; individual tests can override via test.use()
    {
      name: 'e2e',
      testMatch: /(?<!axe)(?<!auth\.setup)\.spec\.js$/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/fixtures/.auth/super_admin.json',
      },
    },
  ],

  webServer: {
    command: 'npx vite --mode test',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
});
