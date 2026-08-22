import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth.js';

// Language preference lives in localStorage — start each test from a clean origin
// so the default (English) is deterministic.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Language switch', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('switching to Hindi translates the login form', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    await page.getByRole('button', { name: 'Language settings' }).click();
    await page.getByRole('button', { name: 'हिन्दी', exact: true }).click();

    await expect(page.getByRole('button', { name: 'साइन इन करें' })).toBeVisible();
    await expect(page.getByText('जारी रखने के लिए अपने क्रेडेंशियल दर्ज करें')).toBeVisible();
  });

  test('Hindi + English mode shows combined labels', async ({ page }) => {
    await page.getByRole('button', { name: 'Language settings' }).click();
    await page.getByRole('button', { name: 'हिंदी + English' }).click();

    await expect(page.getByRole('button', { name: 'साइन इन करें / Sign in' })).toBeVisible();
  });

  test('preference persists in localStorage across reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Language settings' }).click();
    await page.getByRole('button', { name: 'हिन्दी', exact: true }).click();
    await expect(page.getByRole('button', { name: 'साइन इन करें' })).toBeVisible();

    const stored = await page.evaluate(() => localStorage.getItem('app-lang'));
    expect(stored).toBe('hi');

    await page.reload();
    await expect(page.getByRole('button', { name: 'साइन इन करें' })).toBeVisible();
  });

  test('sidebar nav is translated after logging in in Hindi', async ({ page }) => {
    await page.getByRole('button', { name: 'Language settings' }).click();
    await page.getByRole('button', { name: 'हिन्दी', exact: true }).click();

    await page.getByLabel('ईमेल').fill(TEST_USERS.tenant_admin.email);
    await page.getByLabel('पासवर्ड').fill(TEST_USERS.tenant_admin.password);
    await page.getByRole('button', { name: 'साइन इन करें' }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });

    await expect(page.getByRole('link', { name: 'डैशबोर्ड' })).toBeVisible();
  });
});
