import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestApiClient } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Salary', () => {
  test('shows Salary Slips page with filters', async ({ page }) => {
    await page.goto('/staff/salary');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Salary Slips' })).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();
  });

  test('lists the seeded generated slip for its period', async ({ page }) => {
    await page.goto('/staff/salary');
    await page.waitForLoadState('networkidle');

    const selects = page.locator('select');
    await selects.nth(0).selectOption('1'); // January
    await selects.nth(1).selectOption('2024');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Priya Menon')).toBeVisible();
    await expect(page.getByText('generated', { exact: true })).toBeVisible();
  });

  test('lists the seeded failed slip for its period', async ({ page }) => {
    await page.goto('/staff/salary');
    await page.waitForLoadState('networkidle');

    const selects = page.locator('select');
    await selects.nth(0).selectOption('2'); // February
    await selects.nth(1).selectOption('2024');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Bob Jones')).toBeVisible();
    await expect(page.getByText('failed', { exact: true })).toBeVisible();
  });

  test('Download is disabled for a slip with no pdfKey', async ({ page }) => {
    await page.goto('/staff/salary');
    await page.waitForLoadState('networkidle');

    const selects = page.locator('select');
    await selects.nth(0).selectOption('1');
    await selects.nth(1).selectOption('2024');
    await page.waitForLoadState('networkidle');

    const row = page.getByRole('row', { name: /Priya Menon/ });
    await expect(row.getByRole('button', { name: 'Download' })).toBeDisabled();
  });

  test.describe('viewer role', () => {
    test.use({ storageState: 'tests/fixtures/.auth/viewer.json' });

    test('is redirected away from the Salary page', async ({ page }) => {
      await page.goto('/staff/salary');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: 'Salary Slips' })).not.toBeVisible();
    });
  });

  test.describe('tenant_admin write actions', () => {
    test.use({ storageState: 'tests/fixtures/.auth/tenant_admin.json' });

    test('Generate All Slips runs an async job and the table reflects the result', async ({
      page,
    }) => {
      const now = new Date();
      await page.goto('/staff/salary');
      await page.waitForLoadState('networkidle');

      // Default filters already sit on the current month/year, matching
      // seed-test-data.js's staffWithSalaryStructure fixture (the only
      // seeded staff with a salaryStructureId set).
      await page.getByRole('button', { name: 'Generate All Slips' }).click();

      await expect(page.getByText(/generating slips for/i)).toBeVisible();
      await expect(page.getByText(/slip.*generated\./i)).toBeVisible({ timeout: 30_000 });

      const monthLabel = now.toLocaleString('default', { month: 'long' });
      await expect(page.getByText('Priya Menon')).toBeVisible();
      void monthLabel;
    });

    test('Mark as Paid transitions a generated slip to paid', async ({ page }) => {
      await page.goto('/staff/salary');
      await page.waitForLoadState('networkidle');

      const selects = page.locator('select');
      await selects.nth(0).selectOption('1');
      await selects.nth(1).selectOption('2024');
      await page.waitForLoadState('networkidle');

      const row = page.getByRole('row', { name: /Priya Menon/ });
      await row.getByRole('button', { name: 'Mark as Paid' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Confirm' }).click();
      await expect(dialog).not.toBeVisible({ timeout: 8_000 });

      await expect(row.getByText('paid', { exact: true })).toBeVisible();
      await expect(row.getByRole('button', { name: 'Mark as Paid' })).not.toBeVisible();
    });

    test('Salary Structures page lists the seeded structure and supports create', async ({
      page,
    }) => {
      await page.goto('/staff/salary-structures');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: 'Salary Structures' })).toBeVisible();
      await expect(page.getByText('Basic Structure')).toBeVisible();

      await page.getByRole('button', { name: 'New Structure' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      await dialog.getByLabel('Name').fill('E2E Created Structure');
      await dialog.getByPlaceholder('Label (e.g. Basic)').fill('Base');
      await dialog.getByPlaceholder('Amount').fill('15000');

      await dialog.getByRole('button', { name: 'Create' }).click();
      await expect(dialog).not.toBeVisible({ timeout: 8_000 });
      await expect(page.getByText('E2E Created Structure').first()).toBeVisible();
    });
  });

  test('accountant gets payroll:write but not tenant:admin (API-only check)', async ({
    request,
  }) => {
    const ids = getTestIds();
    void ids;
    const client = await createTestApiClient(request, 'accountant');

    const now = new Date();
    const generateAll = await client.post('/staff/salary-slips/generate-all', {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    });
    expect(generateAll.status()).toBe(202);

    const createStructure = await client.post('/staff/salary-structures', {
      name: 'Should Be Forbidden',
      components: [{ label: 'Basic', type: 'earning', amount: 1000, isPercentage: false }],
    });
    expect(createStructure.status()).toBe(403);
  });
});
