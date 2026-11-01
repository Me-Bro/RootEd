/**
 * Auth setup for the study-center project (see playwright.config.js
 * `setup-studycenter`). Logs in through the second Vite instance on port 5175,
 * which pins the API to the seeded `studycenter` tenant, and saves each role's
 * storageState. Specs pick one with `test.use({ storageState: STUDY_AUTH_STATES.x })`.
 */
import { test as setup } from '@playwright/test';
import { mkdirSync } from 'fs';
import path from 'path';
import { STUDY_USERS, STUDY_AUTH_STATES, loginViaUi } from '../fixtures/auth.js';

mkdirSync(path.join(import.meta.dirname, '../fixtures/.auth'), { recursive: true });

for (const role of Object.keys(STUDY_USERS)) {
  setup(`auth setup: study center ${role}`, async ({ page }) => {
    const { email, password } = STUDY_USERS[role];
    await loginViaUi(page, email, password);
    await page.context().storageState({ path: STUDY_AUTH_STATES[role] });
  });
}
