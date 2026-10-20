/**
 * Runs once before the e2e specs (see playwright.config.js `setup` project).
 * Signs each role in through the API behind the portal's own proxy and saves the
 * browser state, so the refresh cookie lets every spec start already signed in.
 */
import { test as setup } from '@playwright/test';
import { mkdirSync } from 'fs';
import path from 'path';
import { TEST_USERS, AUTH_STATES } from './fixtures/auth.js';

mkdirSync(path.join(import.meta.dirname, 'fixtures/.auth'), { recursive: true });

for (const role of Object.keys(AUTH_STATES)) {
  setup(`auth setup: ${role}`, async ({ page }) => {
    const { email, password } = TEST_USERS[role];
    const res = await page.request.post('/__api/auth/login', { data: { email, password } });
    if (!res.ok()) throw new Error(`login failed for ${role}: ${res.status()} ${await res.text()}`);
    await page.context().storageState({ path: AUTH_STATES[role] });
  });
}
