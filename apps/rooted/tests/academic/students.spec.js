import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

const FIXTURE_DIR = path.join(import.meta.dirname, '../fixtures/files');

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Students page', () => {
  test('loads a section roster directly via ?sectionId=', async ({ page }) => {
    const ids = getTestIds();

    await page.goto(`/academic/students?sectionId=${ids.section._id}`);
    await page.waitForLoadState('networkidle');

    // Seeded 12 students in section A — roster renders as links, not a table.
    await expect(page.getByText(ids.students[0].admissionNo)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('12 students')).toBeVisible();
  });

  test('shows the class grid with no section pre-selected', async ({ page }) => {
    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('listitem').first()).toBeVisible({ timeout: 10_000 });
    // No 40-option native <select> for browsing by section.
    await expect(page.locator('select')).toHaveCount(0);
  });

  test('drilling into a class reveals its section chips, then the roster', async ({ page }) => {
    const ids = getTestIds();

    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    await page.getByRole('listitem').first().click();
    await expect(page.getByRole('group', { name: 'Sections' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'A', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'B', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'A', exact: true }).click();
    await expect(page.getByText(ids.students[0].admissionNo)).toBeVisible({ timeout: 10_000 });
  });

  test('an empty section shows the empty state, Add Student stays available', async ({ page }) => {
    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    await page.getByRole('listitem').first().click();
    await page.getByRole('button', { name: 'B', exact: true }).click();

    await expect(page.getByText('No students in this section yet')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Add Student' })).toBeEnabled();
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

    // Dialog closes
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 8_000 });
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

  test('search narrows results and bypasses the class drill-down', async ({ page }) => {
    const ids = getTestIds();
    const admNo = ids.students[0].admissionNo;

    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Search name or admission no.').fill(admNo);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(admNo)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('1 student', { exact: true })).toBeVisible();
    // Drill-down UI (class grid) hides while a search is active.
    await expect(page.getByRole('listitem')).toHaveCount(0);
  });

  test('search narrows results by name', async ({ page }) => {
    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Search name or admission no.').fill('Student1');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Student1 Test')).toBeVisible({ timeout: 8_000 });
  });

  test('clicking a student name navigates to the detail page', async ({ page }) => {
    const ids = getTestIds();
    const admNo = ids.students[0].admissionNo;

    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('Search name or admission no.').fill(admNo);
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: 'Student1 Test' }).click();
    await page.waitForURL(/\/academic\/students\/[a-f0-9]+$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Student1 Test' })).toBeVisible();
  });

  test('the last viewed section is remembered and pre-opened on the next visit', async ({
    page,
  }) => {
    const ids = getTestIds();

    // First visit: deep-link into section A (simulates having picked it via the chips).
    await page.goto(`/academic/students?sectionId=${ids.section._id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(ids.students[0].admissionNo)).toBeVisible({ timeout: 10_000 });

    // Second visit, no query param — the roster should reopen automatically.
    await page.goto('/academic/students');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(ids.students[0].admissionNo)).toBeVisible({ timeout: 10_000 });
  });
});
