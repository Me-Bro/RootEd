import { test, expect } from '@playwright/test';
import { AUTH_STATES, TEST_USERS, openLoginDialog } from '../fixtures/auth.js';

// Seeded: testschool has a filled-in profile and the code TESTSCH2; secondschool
// has the code SECOND22 and no profile.

test.describe('Org home (tenant admin)', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('shows who the organization is and a way into each area', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: 'Test School' })).toBeVisible();
    await expect(page.getByTestId('org-code')).toHaveText('TEST-SCH2');
    await expect(
      page.getByText('A seeded test school used by the end-to-end specs.')
    ).toBeVisible();
    await expect(page.getByText('12 Station Road')).toBeVisible();
    await expect(page.getByRole('link', { name: 'office@testschool.local' })).toBeVisible();
    // The registration number is on the profile form for admins, never on the home page.
    await expect(page.getByText('REG-TEST-0001')).toHaveCount(0);

    const shortcuts = page.getByRole('region', { name: 'Shortcuts' });
    await expect(shortcuts.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await shortcuts.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('is reachable from the sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Home', exact: true }).first().click();
    await expect(page).toHaveURL(/\/home/);
  });
});

test.describe('Org home (teacher)', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('shows the profile and only the shortcuts the role may open', async ({ page }) => {
    await page.goto('/home');
    await expect(page.getByRole('heading', { level: 1, name: 'Test School' })).toBeVisible();
    await expect(page.getByText('12 Station Road')).toBeVisible();
    await expect(page.getByText('REG-TEST-0001')).toHaveCount(0);
    // A teacher holds no tenant:admin, so none of the admin-only pages are offered.
    const shortcuts = page.getByRole('region', { name: 'Shortcuts' });
    await expect(shortcuts.getByRole('link', { name: 'Report card design' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Complete your profile' })).toHaveCount(0);
  });
});

test.describe('Switching organization', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the dropdown switches org and lands on the new org home', async ({ page }) => {
    await page.goto('/login');
    const dialog = await openLoginDialog(page);
    await dialog.getByLabel('Email').fill(TEST_USERS.multiTenant.email);
    await dialog.getByLabel('Password', { exact: true }).fill(TEST_USERS.multiTenant.password);
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/select-tenant');

    await page.getByRole('button', { name: /Test School/ }).click();
    await page.waitForURL('**/home');
    await expect(page.getByTestId('org-code')).toHaveText('TEST-SCH2');

    // Open the header dropdown and pick the other organization.
    await page
      .getByRole('button', { name: /Test School/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: /Second School/ }).click();
    await page.waitForURL('**/home');
    await expect(page.getByRole('heading', { level: 1, name: 'Second School' })).toBeVisible();
    await expect(page.getByTestId('org-code')).toHaveText('SECO-ND22');
  });
});
