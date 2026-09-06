import { test, expect } from '@playwright/test';
import { visibleText } from '../fixtures/dom.js';
import { openLoginDialog, TEST_USERS } from '../fixtures/auth.js';

test.use({ storageState: { cookies: [], origins: [] } });

const unique = () => `e2e-org-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

/**
 * Signs in as the seeded account that belongs to no organization. Registering
 * through the UI would leave the account unverified — the e2e API runs without
 * an SMTP host, so no verification mail is sent — and adding a test-only verify
 * endpoint to the auth API is not a trade worth making for a fixture.
 */
async function signInWithNoOrg(page, who = 'noOrg') {
  const user = TEST_USERS[who];
  await page.goto('/login');
  const dialog = await openLoginDialog(page);
  await dialog.getByLabel('Email').fill(user.email);
  await dialog.getByLabel('Password').fill(user.password);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('Onboarding', () => {
  test('an account with no organization lands on onboarding, not a broken dashboard', async ({
    page,
  }) => {
    await signInWithNoOrg(page);

    // The failure this replaces: /dashboard fetching /tenant/settings,
    // resolveTenant() 404ing for want of a tenantId claim, and a broken card.
    await page.waitForURL('**/onboarding', { timeout: 15_000 });
    await expect(visibleText(page, /get started/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /join an organization/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /create an organization/i })).toBeVisible();
  });

  test('visiting a tenant route without an organization redirects to onboarding', async ({
    page,
  }) => {
    await signInWithNoOrg(page);
    await page.waitForURL('**/onboarding', { timeout: 15_000 });

    await page.goto('/academic/students');
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test('creating an organization drops the founder straight into it', async ({ page }) => {
    const id = unique();
    // Its own account: this one ends the test as a member, so sharing it would
    // leave the redirect test above seeing an organization.
    await signInWithNoOrg(page, 'noOrg2');
    await page.waitForURL('**/onboarding', { timeout: 15_000 });

    await page.getByRole('button', { name: /create an organization/i }).click();
    await expect(page).toHaveURL(/\/orgs\/new/);

    await page.getByLabel('Organization name').fill(`E2E School ${id}`);
    await page.getByRole('button', { name: /create an organization/i }).click();

    // POST /orgs hands back a session already scoped to the new organization,
    // so there is no tenant picker in the way.
    await page.waitForURL('**/dashboard', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: new RegExp(`E2E School ${id}`) })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('a wrong join code is refused without saying whether the org exists', async ({ page }) => {
    await signInWithNoOrg(page, 'noOrg3');
    await page.waitForURL('**/onboarding', { timeout: 15_000 });

    await page.getByRole('button', { name: /join an organization/i }).click();
    await page.getByLabel('Join code').fill('RTED-ZZZZZ-ZZZZZ');
    await page.getByRole('button', { name: /request to join/i }).click();

    await expect(page.getByRole('alert')).toContainText(/not valid/i, { timeout: 10_000 });
  });
});

test.describe('Org switcher', () => {
  test.use({ storageState: 'tests/fixtures/.auth/tenant_admin.json' });

  test('names the current organization in the header', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: /Test School/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('lists the organizations you belong to', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Test School/ }).click();

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Test School/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /create an organization/i })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /join an organization/i })).toBeVisible();
  });
});
