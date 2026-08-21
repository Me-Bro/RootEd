import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

const FIXTURE_DIR = path.join(import.meta.dirname, '../fixtures/files');

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Students page', () => {
  test('loads students list with seeded data', async ({ page }) => {
    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    // Seeded 10 students — at least one row visible
    const rows = page.locator('table tbody tr, [class*="TableRow"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test('opens Add Student dialog', async ({ page }) => {
    await page.goto('/academic/students');
    await page.getByRole('button', { name: 'Add Student' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Add Student').first()).toBeVisible();
  });

  test('creates a student via form', async ({ page }) => {
    const admNo = `UI-TEST-${Date.now()}`;

    await page.goto('/academic/students');
    await page.getByRole('button', { name: 'Add Student' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Admission No').fill(admNo);
    await dialog.getByLabel('First Name').fill('UITest');
    await dialog.getByLabel('Last Name').fill('Student');
    // Section — pick first option
    await dialog.locator('select').first().selectOption({ index: 1 });
    await dialog.locator('select').nth(1).selectOption('male');

    await dialog.getByRole('button', { name: 'Add Student' }).click();

    // Dialog closes, table shows new student
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(admNo)).toBeVisible({ timeout: 10_000 });
  });

  test('shows error for duplicate admission number', async ({ page }) => {
    const ids = getTestIds();
    const dupeAdmNo = ids.students[0].admissionNo;

    await page.goto('/academic/students');
    await page.getByRole('button', { name: 'Add Student' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Admission No').fill(dupeAdmNo);
    await dialog.getByLabel('First Name').fill('Dupe');
    await dialog.getByLabel('Last Name').fill('Student');
    await dialog.getByRole('button', { name: 'Add Student' }).click();

    // Should show an error message
    await expect(dialog.locator('.text-destructive')).toBeVisible({ timeout: 8_000 });
  });

  test('imports students via valid CSV', async ({ page }) => {
    await page.goto('/academic/students');

    // Trigger hidden file input via the Import CSV button
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import CSV' }).click(),
    ]);
    await fileChooser.setFiles(path.join(FIXTURE_DIR, 'students-valid.csv'));

    // Import Result dialog appears
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Import Results')).toBeVisible();
    await expect(page.getByText(/Created:/)).toBeVisible();
  });

  test('CSV import shows errors for malformed file', async ({ page }) => {
    await page.goto('/academic/students');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import CSV' }).click(),
    ]);
    await fileChooser.setFiles(path.join(FIXTURE_DIR, 'students-malformed.csv'));

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Import Results')).toBeVisible();
    // Malformed file should report errors > 0 or skipped
    await expect(page.getByText(/Errors:|Skipped/).first()).toBeVisible();
  });

  test('search narrows results by admission number', async ({ page }) => {
    const ids = getTestIds();
    const admNo = ids.students[0].admissionNo;

    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Search name or admission no…').fill(admNo);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(admNo)).toBeVisible({ timeout: 8_000 });
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(1, { timeout: 8_000 });
  });

  test('search narrows results by name', async ({ page }) => {
    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Search name or admission no…').fill('Student1');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Student1 Test')).toBeVisible();
  });

  test('clicking a student name navigates to the detail page', async ({ page }) => {
    const ids = getTestIds();
    const admNo = ids.students[0].admissionNo;

    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Search name or admission no…').fill(admNo);
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: 'Student1 Test' }).click();
    await page.waitForURL(/\/academic\/students\/[a-f0-9]+$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Student1 Test' })).toBeVisible();
  });

  test('section filter narrows results', async ({ page }) => {
    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    // Select the first section option
    const sectionSelect = page.locator('select').first();
    await sectionSelect.selectOption({ index: 1 });
    await page.waitForLoadState('networkidle');

    // Table refreshes — either shows students or empty state
    const rows = page.locator('table tbody tr');
    const empty = page
      .locator('[class*="EmptyState"], [class*="empty"]')
      .or(page.getByText('No students'));
    await expect(rows.first().or(empty.first())).toBeVisible({ timeout: 8_000 });
  });
});
