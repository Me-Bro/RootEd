import { test, expect } from '@playwright/test';
import path from 'path';
import { AUTH_STATES, TEST_USERS, openLoginDialog } from '../fixtures/auth.js';

const LOGO = path.join(import.meta.dirname, '../fixtures/files/logo.png');

// Seeded by seed-test-data.js: testschool has a filled-in profile and the code
// TESTSCH2; secondschool has the code SECOND22. These tests change the saved
// profile, so they run in order and put the phone number back.
const SEEDED_PHONE = '+91 20 5555 0100';

test.describe.configure({ mode: 'serial' });

test.describe('Org profile page (tenant admin)', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('shows the permanent code with a copy button', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/tenant/profile');
    await expect(page.getByTestId('org-code')).toHaveText('TEST-SCH2');
    await page.getByRole('button', { name: 'Copy organization code' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('TEST-SCH2');
  });

  test('saves the address and phone, and they persist after a reload', async ({ page }) => {
    await page.goto('/tenant/profile');
    await page.getByLabel('Phone').fill('+91 99999 00000');
    await page.getByLabel('City').fill('Nagpur');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Phone')).toHaveValue('+91 99999 00000');
    await expect(page.getByLabel('City')).toHaveValue('Nagpur');
    // Saving one section did not wipe the rest.
    await expect(page.getByLabel('Address line 1')).toHaveValue('12 Station Road');

    await page.getByLabel('Phone').fill(SEEDED_PHONE);
    await page.getByLabel('City').fill('Pune');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
  });

  test('rejects a bad website with a visible error and saves nothing', async ({ page }) => {
    await page.goto('/tenant/profile');
    await page.getByLabel('Website').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Website')).toHaveValue('https://testschool.example');
  });

  test('uploads a logo, and a bad file is refused without losing typed text', async ({ page }) => {
    await page.goto('/tenant/profile');
    await page.getByLabel('Logo image file').setInputFiles(LOGO);
    await expect(page.getByRole('button', { name: 'Remove logo' })).toBeVisible();

    await page.getByLabel('Phone').fill('+91 11111 22222');
    await page.getByLabel('Logo image file').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });
    await expect(page.getByRole('alert')).toContainText('PNG or JPEG');
    await expect(page.getByLabel('Phone')).toHaveValue('+91 11111 22222');

    await page.getByRole('button', { name: 'Remove logo' }).click();
    await expect(page.getByRole('button', { name: 'Remove logo' })).toHaveCount(0);
  });
});

test.describe('Org profile page (teacher)', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('is readable but not editable, and hides the registration number', async ({ page }) => {
    await page.goto('/tenant/profile');
    await expect(page.getByTestId('org-code')).toHaveText('TEST-SCH2');
    await expect(page.getByText(SEEDED_PHONE)).toBeVisible();
    await expect(page.getByText('12 Station Road')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save profile' })).toHaveCount(0);
    await expect(page.getByLabel('Phone')).toHaveCount(0);
    await expect(page.getByText('REG-TEST-0001')).toHaveCount(0);
  });
});

test.describe('Org picker shows the code', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a user in two orgs sees each name with its own code', async ({ page }) => {
    await page.goto('/login');
    const dialog = await openLoginDialog(page);
    await dialog.getByLabel('Email').fill(TEST_USERS.multiTenant.email);
    await dialog.getByLabel('Password', { exact: true }).fill(TEST_USERS.multiTenant.password);
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/select-tenant');

    await expect(page.getByRole('button', { name: /Test School/ })).toContainText('TEST-SCH2');
    await expect(page.getByRole('button', { name: /Second School/ })).toContainText('SECO-ND22');
  });
});
