/**
 * Runs once before the e2e specs (see playwright.config.js `setup` project).
 *
 * 1. Re-seeds the test database. The specs assert exact figures and some of them
 *    change data (scoring, completion decisions), so every run starts from the
 *    same known state instead of whatever the last run (or the web suite) left.
 * 2. Signs each role in through the API behind the portal's own proxy and saves
 *    the browser state, so the refresh cookie lets every spec start signed in.
 */
import { test as setup } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import path from 'path';
import { TEST_USERS, AUTH_STATES } from './fixtures/auth.js';

mkdirSync(path.join(import.meta.dirname, 'fixtures/.auth'), { recursive: true });

setup.describe.configure({ mode: 'serial' });

setup('seed the test database', () => {
  setup.setTimeout(180_000);
  const apiDir = path.join(import.meta.dirname, '../../api');
  execFileSync(
    process.execPath,
    ['--env-file=.env.test', 'src/scripts/seed-test-data.js', '--clean'],
    {
      cwd: apiDir,
      env: process.env,
      stdio: 'pipe',
    }
  );
});

for (const role of Object.keys(AUTH_STATES)) {
  setup(`auth setup: ${role}`, async ({ page }) => {
    const { email, password } = TEST_USERS[role];
    const res = await page.request.post('/__api/auth/login', { data: { email, password } });
    if (!res.ok()) throw new Error(`login failed for ${role}: ${res.status()} ${await res.text()}`);
    await page.context().storageState({ path: AUTH_STATES[role] });
  });
}
