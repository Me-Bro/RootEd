/**
 * Auth setup — runs once before all e2e tests (see playwright.config.js `setup` project).
 * Logs in as each role via the UI and saves the browser storageState (cookies).
 * Tests import these state files via `test.use({ storageState })`.
 */
import { test as setup } from '@playwright/test';
import { mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { TEST_USERS, AUTH_STATES, loginViaUi } from './fixtures/auth.js';

// Ensure .auth directory exists
mkdirSync(path.join(import.meta.dirname, 'fixtures/.auth'), { recursive: true });

function getTestIds() {
  const p = path.join(import.meta.dirname, 'seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// super_admin only gets tenant-module permissions while actively impersonating
// a tenant (see apps/api/src/middleware/requirePermission.js) — without this,
// every tenant-scoped page (attendance, grades, staff, fee, ...) 403s under the
// default e2e storageState. Impersonates the seeded testschool tenant via the
// same endpoints the real "Login to tenant" UI button uses, entirely through
// page.request (mirrors tests/fixtures/data.js's createTestApiClient) so no
// subdomain navigation or Vite allowedHosts change is needed.
async function loginAsImpersonatingSuperAdmin(page, tenantId) {
  const { email, password } = TEST_USERS.super_admin;

  const loginRes = await page.request.post('/__api/auth/login', { data: { email, password } });
  const { accessToken: loginToken } = await loginRes.json();

  const csrfRes = await page.request.get('/__api/csrf-token');
  const { csrfToken } = await csrfRes.json();

  const impersonateRes = await page.request.post(`/__api/admin/tenants/${tenantId}/impersonate`, {
    headers: { Authorization: `Bearer ${loginToken}`, 'x-csrf-token': csrfToken },
  });
  const { accessToken: impersonationToken } = await impersonateRes.json();

  // Overwrites the refreshToken cookie with the impersonation-scoped one
  // (30 min) — the piece the UI's redirect-to-subdomain flow exists to trigger.
  await page.request.post('/__api/auth/impersonation-session', {
    headers: { Authorization: `Bearer ${impersonationToken}`, 'x-csrf-token': csrfToken },
  });
}

setup('auth setup: super_admin', async ({ page }) => {
  const { tenant } = getTestIds();
  await loginAsImpersonatingSuperAdmin(page, tenant._id);
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

setup('auth setup: principal', async ({ page }) => {
  const { email, password } = TEST_USERS.principal;
  await loginViaUi(page, email, password);
  await page.context().storageState({ path: AUTH_STATES.principal });
});
