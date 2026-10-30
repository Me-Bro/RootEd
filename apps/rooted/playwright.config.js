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

    // Viewport-agnostic specs only, mobile viewport — catches responsive
    // overflow/layout bugs the desktop project can't see. Deliberately NOT
    // the whole suite: most feature specs under tests/academic, tests/staff,
    // etc. assert against desktop-only interactive elements (a <table> grid,
    // native <select>s) for pages that intentionally swap to a different
    // layout (cards/chips) below the md breakpoint — those already have their
    // own dedicated narrow-viewport test via page.setViewportSize() within an
    // otherwise-desktop spec (see e.g. timetable.spec.js, my-schedule.spec.js).
    // Running them under a phone-width project too just breaks on the correct
    // responsive behavior, not a real bug.
    {
      name: 'mobile',
      testMatch: [/tests[\\/]sweep[\\/].*\.spec\.js$/, /tests[\\/]admin[\\/].*\.spec\.js$/],
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 7'],
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
