/**
 * Auth setup — runs once before all e2e tests (see playwright.config.js `setup` project).
 * Logs in as each role via the UI and saves the browser storageState (cookies).
 * Tests import these state files via `test.use({ storageState })`.
 */
import { test as setup } from '@playwright/test';
import { mkdirSync } from 'fs';
import path from 'path';
import { TEST_USERS, AUTH_STATES, loginViaUi } from './fixtures/auth.js';

// Ensure .auth directory exists
mkdirSync(path.join(import.meta.dirname, 'fixtures/.auth'), { recursive: true });

setup('auth setup: super_admin', async ({ page }) => {
  const { email, password } = TEST_USERS.super_admin;
  await loginViaUi(page, email, password);
  await page.context().storageState({ path: AUTH_STATES.super_admin });
});

setup('auth setup: tenant_admin', async ({ page }) => {
  const { email, password } = TEST_USERS.tenant_admin;
  await loginViaUi(page, email, password);
  await page.context().storageState({ path: AUTH_STATES.tenant_admin });
});

setup('auth setup: teacher', async ({ page }) => {
  const { email, password } = TEST_USERS.teacher;
  await loginViaUi(page, email, password);
  await page.context().storageState({ path: AUTH_STATES.teacher });
});

setup('auth setup: viewer', async ({ page }) => {
  const { email, password } = TEST_USERS.viewer;
  await loginViaUi(page, email, password);
  await page.context().storageState({ path: AUTH_STATES.viewer });
});
