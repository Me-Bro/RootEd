import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { AUTH_STATES } from '../fixtures/auth.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// 2025-06-02 is a Monday, inside the seeded 2025-26 academic year and
// within Alice Smith's Monday/period-1 Mathematics slot (09:00-09:45).
const MONDAY_DURING_MATH = '2025-06-02T09:15:00';

test.describe('My Schedule page', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('auto-selects the active academic year and shows the seeded schedule', async ({ page }) => {
    const { academicYear } = getTestIds();

    await page.goto('/academic/my-timetable');
    await page.waitForLoadState('networkidle');

    const grid = page.getByRole('table');
    await expect(page.locator('select')).toHaveValue(academicYear._id);
    await expect(grid.getByText('A · Mathematics')).toBeVisible();
    await expect(grid.getByText('09:00–09:45 · Room 101')).toBeVisible();
  });

  test("highlights today's column/period and deep-links the current class to attendance", async ({
    page,
  }) => {
    const { section, subjects } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');

    await page.clock.install({ time: new Date(MONDAY_DURING_MATH) });
    await page.goto('/academic/my-timetable');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('th', { hasText: 'Monday' })).toHaveClass(/bg-primary\/10/);

    const link = page.getByRole('link', { name: /A · Mathematics/ });
    await expect(link).toHaveClass(/ring-primary/);
    await expect(link).toHaveAttribute(
      'href',
      `/academic/attendance?sectionId=${section._id}&subjectId=${math._id}`
    );

    await link.click();
    await expect(page).toHaveURL(/\/academic\/attendance/);
    await expect(page.locator('select').first()).toHaveValue(section._id);
  });

  test('shows a stacked card layout instead of the table on narrow viewports', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto('/academic/my-timetable');
    await page.waitForLoadState('networkidle');

    const cards = page.locator('.md\\:hidden');
    await expect(page.locator('table')).toBeHidden();
    await expect(cards.getByText('Period 1').first()).toBeVisible();
    await expect(cards.getByText('A · Mathematics')).toBeVisible();
  });
});
