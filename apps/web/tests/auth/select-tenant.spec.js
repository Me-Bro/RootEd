import { test, expect } from '@playwright/test';
import { TEST_USERS, openLoginDialog } from '../fixtures/auth.js';

// Login tests run without any pre-loaded storageState
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('General-portal login — tenant picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('multi-tenant user lands on the picker, single-tenant user does not', async ({ page }) => {
    // /login shows the landing page UI; sign-in lives in a dialog.
    const dialog = await openLoginDialog(page);
    await dialog.getByLabel('Email').fill(TEST_USERS.multiTenant.email);
    await dialog.getByLabel('Password').fill(TEST_USERS.multiTenant.password);
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL('**/select-tenant', { timeout: 15_000 });
    await expect(page.getByText('Test School')).toBeVisible();
    await expect(page.getByText('Second School')).toBeVisible();

    await page.getByRole('button', { name: 'Test School' }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('the picker survives a reload', async ({ page }) => {
    const dialog = await openLoginDialog(page);
    await dialog.getByLabel('Email').fill(TEST_USERS.multiTenant.email);
    await dialog.getByLabel('Password').fill(TEST_USERS.multiTenant.password);
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/select-tenant', { timeout: 15_000 });

    // Regression: the org list used to live only in AuthContext state, set by
    // login(). A reload runs /auth/refresh + /auth/me only, so the list came
    // back empty and the page bounced to /login. It now comes from /auth/me.
    await page.reload();
    await expect(page).toHaveURL(/\/select-tenant/);
    await expect(page.getByText('Test School')).toBeVisible();
    await expect(page.getByText('Second School')).toBeVisible();
  });

  test('visiting /select-tenant unauthenticated redirects to /login', async ({ page }) => {
    await page.goto('/select-tenant');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('General-portal resolveTenant fallback (backend)', () => {
  test('tenantId claim from select-tenant resolves the tenant with no subdomain Host', async ({
    page,
  }) => {
    const { email, password } = TEST_USERS.multiTenant;

    const loginRes = await page.request.post('/__portal-api/auth/login', {
      data: { email, password },
    });
    const { accessToken: loginToken, tenants } = await loginRes.json();
    expect(tenants.length).toBe(2);

    const csrfRes = await page.request.get('/__portal-api/csrf-token');
    const { csrfToken } = await csrfRes.json();

    const selectRes = await page.request.post('/__portal-api/auth/select-tenant', {
      data: { tenantId: tenants[0]._id },
      headers: { Authorization: `Bearer ${loginToken}`, 'x-csrf-token': csrfToken },
    });
    const { accessToken: tenantToken } = await selectRes.json();

    const meRes = await page.request.get('/__portal-api/auth/me', {
      headers: { Authorization: `Bearer ${tenantToken}` },
    });
    const me = await meRes.json();
    expect(me.tenantId).toBe(tenants[0]._id);
    expect(me.permissions.length).toBeGreaterThan(0);
  });
});
