import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Seeded range with no per-period (subject) records mixed in, so period-level
// pct math is easy to reason about: student 1 has 1 absence in 4 days (75%,
// exactly at the threshold — not a defaulter), student 2 has 3 absences in 4
// days (25% — a defaulter). See seed-test-data.js's attendance block.
const FROM = '2025-06-02';
const TO = '2025-06-05';

test.describe('Attendance report page', () => {
  test('loads via deep link with sectionId, shows class average', async ({ page }) => {
    const { section } = getTestIds();

    await page.goto(`/academic/attendance/report?sectionId=${section._id}`);
    await page.locator('input[type="date"]').first().fill(FROM);
    await page.locator('input[type="date"]').last().fill(TO);

    await expect(page.getByText(/Class average/)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('table')).toBeVisible();
  });

  test('flags the low-attendance student as a defaulter, not the higher-attendance one', async ({
    page,
  }) => {
    const { section, students } = getTestIds();
    const student1 = students.find((s) => s.admissionNo.endsWith('001'));
    const student2 = students.find((s) => s.admissionNo.endsWith('002'));

    await page.goto(`/academic/attendance/report?sectionId=${section._id}`);
    await page.locator('input[type="date"]').first().fill(FROM);
    await page.locator('input[type="date"]').last().fill(TO);
    await page.locator('table').waitFor({ timeout: 10_000 });

    const row1 = page.locator('tbody tr', { hasText: student1.admissionNo });
    const row2 = page.locator('tbody tr', { hasText: student2.admissionNo });

    await expect(row1.getByText('Defaulter')).toHaveCount(0);
    await expect(row2.getByText('Defaulter')).toBeVisible();
  });

  test('exports the report as CSV', async ({ page }) => {
    const { section } = getTestIds();

    await page.goto(`/academic/attendance/report?sectionId=${section._id}`);
    await page.locator('input[type="date"]').first().fill(FROM);
    await page.locator('input[type="date"]').last().fill(TO);
    await page.locator('table').waitFor({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/attendance-report-.*\.csv/);
  });
});
