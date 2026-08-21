import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Attendance page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/academic/attendance');
    await page.waitForLoadState('networkidle');
  });

  test('renders date and section controls', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Attendance' })).toBeVisible();
    await expect(page.locator('input[type="date"]')).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();
    await expect(page.getByText('Select a section')).toBeVisible();
  });

  test('selecting section loads student list', async ({ page }) => {
    const sectionSelect = page.locator('select').first();
    await sectionSelect.selectOption({ index: 1 });

    // Students should appear
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });

  test('cycles attendance status on button click', async ({ page }) => {
    const sectionSelect = page.locator('select').first();
    await sectionSelect.selectOption({ index: 1 });
    await page.locator('table').waitFor({ timeout: 10_000 });

    const firstStatusBtn = page.locator('table tbody tr').first().getByRole('button');
    const initialText = await firstStatusBtn.textContent();

    await firstStatusBtn.click();
    const afterText = await firstStatusBtn.textContent();

    // Text should change (cycles through statuses)
    expect(afterText).not.toBe(initialText);
  });

  test('saves attendance and shows success message', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    await page.locator('input[type="date"]').fill(today);

    const sectionSelect = page.locator('select').first();
    await sectionSelect.selectOption({ index: 1 });
    await page.locator('table').waitFor({ timeout: 10_000 });

    // Mark first 3 students as present
    const rows = page.locator('table tbody tr');
    for (let i = 0; i < Math.min(3, await rows.count()); i++) {
      const btn = rows.nth(i).getByRole('button');
      // Click until "present"
      let attempts = 0;
      while ((await btn.textContent())?.toLowerCase() !== 'present' && attempts < 4) {
        await btn.click();
        attempts++;
      }
    }

    await page.getByRole('button', { name: 'Save Attendance' }).click();
    await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 10_000 });
  });

  test('save attendance is disabled while saving', async ({ page }) => {
    const sectionSelect = page.locator('select').first();
    await sectionSelect.selectOption({ index: 1 });
    await page.locator('table').waitFor({ timeout: 10_000 });

    const saveBtn = page.getByRole('button', { name: 'Save Attendance' });

    // Intercept only the save POST to slow it down — the same URL also matches the
    // page's GET for existing records, and delaying that too caused a late
    // route.continue() to fire after the test/context had already closed.
    await page.route('**/academic/attendance', (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      setTimeout(() => route.continue(), 500);
    });

    await saveBtn.click();
    // After click, button text changes — use a fresh locator that matches the new text
    await expect(page.getByRole('button', { name: /Saving/i })).toBeVisible({ timeout: 3_000 });
    // Wait for the delayed save to actually complete before unrouting — unrouting
    // while the intercepted request is still in flight races with its own
    // route.continue(), which throws "Route is already handled!".
    await expect(page.getByText(/saved successfully/i)).toBeVisible({ timeout: 5_000 });
    await page.unrouteAll();
  });

  test("subject select loads that subject's period record instead of the daily one", async ({
    page,
  }) => {
    const { section, students, subjects } = getTestIds();
    const student1 = students.find((s) => s.admissionNo.endsWith('001'));
    const math = subjects.find((s) => s.name === 'Mathematics');
    const english = subjects.find((s) => s.name === 'English');

    // Seeded per-period date: student 1 is present in Math, absent in English.
    await page.locator('input[type="date"]').fill('2025-06-06');
    await page.locator('select').first().selectOption(section._id);
    await page.locator('table').waitFor({ timeout: 10_000 });

    const subjectSelect = page.locator('select').nth(1);
    const row = page.locator('tbody tr', { hasText: student1.admissionNo });

    await subjectSelect.selectOption(math._id);
    await expect(row.getByRole('button')).toHaveText('present', { timeout: 10_000 });

    await subjectSelect.selectOption(english._id);
    await expect(row.getByRole('button')).toHaveText('absent', { timeout: 10_000 });
  });

  test('"Mark all Present" sets every loaded student to present', async ({ page }) => {
    const sectionSelect = page.locator('select').first();
    await sectionSelect.selectOption({ index: 1 });
    await page.locator('table').waitFor({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Mark all Present' }).click();

    const buttons = page.locator('table tbody tr').getByRole('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      await expect(buttons.nth(i)).toHaveText('present');
    }
  });

  test('"View Report" link navigates to the attendance report page', async ({ page }) => {
    const sectionSelect = page.locator('select').first();
    await sectionSelect.selectOption({ index: 1 });

    await page.getByRole('link', { name: 'View Report →' }).click();
    await expect(page).toHaveURL(/\/academic\/attendance\/report/);
    await expect(page.getByRole('heading', { name: 'Attendance Report' })).toBeVisible();
  });
});
