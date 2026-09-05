import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestApiClient } from '../fixtures/data.js';
import { visibleText } from '../fixtures/dom.js';

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

    await expect(visibleText(page, 'Priya Menon')).toBeVisible();
    await expect(visibleText(page, 'generated', { exact: true })).toBeVisible();
    await expect(visibleText(page, 'Total payroll')).toBeVisible();
  });

  test('lists the seeded failed slip for its period', async ({ page }) => {
    await page.goto('/staff/salary');
    await page.waitForLoadState('networkidle');

    const selects = page.locator('select');
    await selects.nth(0).selectOption('2'); // February
    await selects.nth(1).selectOption('2024');
    await page.waitForLoadState('networkidle');

    await expect(visibleText(page, 'Bob Jones')).toBeVisible();
    await expect(visibleText(page, 'failed', { exact: true })).toBeVisible();
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

      await expect(visibleText(page, /generating slips for/i)).toBeVisible();
      // Live progress bar (docs/mobile-ui/13-salary-approved.html) replaces the old
      // silent "Status: active — polling…" text while the batch job is in flight.
      await expect(page.getByRole('progressbar')).toBeVisible();
      await expect(visibleText(page, /slip.*generated\./i)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('progressbar')).not.toBeVisible();

      const monthLabel = now.toLocaleString('default', { month: 'long' });
      await expect(visibleText(page, 'Priya Menon')).toBeVisible();
      await expect(visibleText(page, 'Total payroll')).toBeVisible();
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
      await expect(visibleText(page, 'Basic Structure')).toBeVisible();

      await page.getByRole('button', { name: 'New Structure' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      await dialog.getByLabel('Name').fill('E2E Created Structure');
      await dialog.getByPlaceholder('Label (e.g. Basic)').fill('Base');
      await dialog.getByPlaceholder('Amount').fill('15000');

      await dialog.getByRole('button', { name: 'Create' }).click();
      await expect(dialog).not.toBeVisible({ timeout: 8_000 });
      await expect(visibleText(page, 'E2E Created Structure')).toBeVisible();
    });

    test('salary structure cards show a staff-count badge', async ({ page }) => {
      const ids = getTestIds();
      await page.goto('/staff/salary-structures');
      await page.waitForLoadState('networkidle');

      const basicCard = page.getByTestId(`salary-structure-card-${ids.salaryStructure._id}`);
      await expect(basicCard.getByText('1 staff')).toBeVisible();

      const unusedCard = page.getByTestId(`salary-structure-card-${ids.salaryStructureUnused._id}`);
      await expect(unusedCard.getByText('0 staff')).toBeVisible();
    });

    test('Delete is disabled, with an explanatory title, for a structure with staff assigned', async ({
      page,
    }) => {
      const ids = getTestIds();
      await page.goto('/staff/salary-structures');
      await page.waitForLoadState('networkidle');

      const basicCard = page.getByTestId(`salary-structure-card-${ids.salaryStructure._id}`);
      const deleteButton = basicCard.getByRole('button', { name: 'Delete' });
      await expect(deleteButton).toBeDisabled();
      await expect(deleteButton).toHaveAttribute('title', /staff member/i);
    });

    test('Duplicate prefills the New Structure modal from an existing structure', async ({
      page,
    }) => {
      const ids = getTestIds();
      await page.goto('/staff/salary-structures');
      await page.waitForLoadState('networkidle');

      const basicCard = page.getByTestId(`salary-structure-card-${ids.salaryStructure._id}`);
      await basicCard.getByRole('button', { name: 'Duplicate' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('Name')).toHaveValue('Copy of Basic Structure');
      await expect(dialog.getByPlaceholder('Label (e.g. Basic)').nth(0)).toHaveValue('Basic');
      await expect(dialog.getByPlaceholder('Label (e.g. Basic)').nth(1)).toHaveValue('HRA');

      // Cancel, not submit — a real create here would shift later
      // count/list assertions in this file.
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).not.toBeVisible();
    });

    test('a percentage component over 100% is rejected with a clear message', async ({ page }) => {
      await page.goto('/staff/salary-structures');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'New Structure' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      await dialog.getByLabel('Name').fill('E2E Invalid Percentage Structure');
      await dialog.getByPlaceholder('Label (e.g. Basic)').first().fill('Basic');
      await dialog.getByPlaceholder('Amount').first().fill('10000');

      await dialog.getByRole('button', { name: '+ Add Row' }).click();
      await dialog.getByPlaceholder('Label (e.g. Basic)').nth(1).fill('HRA');
      await dialog.locator('input[type="checkbox"]').nth(1).check();
      await dialog.getByPlaceholder('Percent').fill('150');
      await dialog.locator('select').last().selectOption({ label: 'Basic' });

      await dialog.getByRole('button', { name: 'Create' }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/between 0 and 100/i)).toBeVisible();
    });

    // Permanently consumes the "Unused Structure" fixture — run last in this
    // file, after the badge test above (which still expects the card to
    // exist), matching the existing "Mark as Paid" precedent of a test that
    // consumes its own fixture.
    test('Delete removes a structure with zero staff assigned', async ({ page }) => {
      const ids = getTestIds();
      await page.goto('/staff/salary-structures');
      await page.waitForLoadState('networkidle');

      const unusedCard = page.getByTestId(`salary-structure-card-${ids.salaryStructureUnused._id}`);
      await unusedCard.getByRole('button', { name: 'Delete' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Delete' }).click();
      await expect(dialog).not.toBeVisible({ timeout: 8_000 });

      await expect(
        page.getByTestId(`salary-structure-card-${ids.salaryStructureUnused._id}`)
      ).toHaveCount(0);
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

  test('deleting a salary structure with staff assigned returns 409 (API-only check)', async ({
    request,
  }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'tenant_admin');

    const res = await client.delete(`/staff/salary-structures/${ids.salaryStructure._id}`);
    expect(res.status()).toBe(409);
  });
});
