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
    const { section } = getTestIds();

    await page.clock.install({ time: new Date(MONDAY_DURING_MATH) });
    await page.goto('/academic/my-timetable');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('th', { hasText: 'Monday' })).toHaveClass(/bg-primary\/10/);

    const link = page.getByRole('link', { name: /A · Mathematics/ });
    await expect(link).toHaveClass(/ring-primary/);
    // Section only — AttendancePage is a daily roll and ignores a subjectId param.
    await expect(link).toHaveAttribute('href', `/academic/attendance?sectionId=${section._id}`);

    await link.click();
    await expect(page).toHaveURL(`/academic/attendance?sectionId=${section._id}`);
    // Section picker on AttendancePage is a DropdownMenu (not a native <select>)
    // — assert on the trigger's label, which the page derives from the
    // sectionId query param via useState's lazy initializer.
    await expect(page.getByRole('button', { name: /Grade 5-A/ })).toBeVisible();
  });

  test('moves the current-period ring as time passes, without a reload', async ({ page }) => {
    await page.clock.install({ time: new Date(MONDAY_DURING_MATH) });
    await page.goto('/academic/my-timetable');
    await page.waitForLoadState('networkidle');

    const math = page.getByRole('link', { name: /A · Mathematics/ });
    // Disambiguated by start time — the test DB has a second English slot later
    // the same day, and both share a section/subject label.
    const english = page.getByRole('link', { name: /A · English 09:45/ });
    await expect(math).toHaveClass(/ring-primary/);
    await expect(english).not.toHaveClass(/ring-primary/);

    // 09:15 -> 10:00: period 1 (09:00-09:45) is over, period 2 (09:45-10:30) is live.
    await page.clock.fastForward('45:00');

    await expect(math).not.toHaveClass(/ring-primary/);
    await expect(english).toHaveClass(/ring-primary/);
  });

  test('shows an empty state, not a grid of dashes, when nothing is timetabled', async ({
    page,
  }) => {
    // A teacher with no slots (or whose sections are all unpublished) gets an
    // empty list back from the same endpoint — stub it rather than reshaping
    // the shared seed.
    await page.route('**/timetable?**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );

    await page.goto('/academic/my-timetable');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('No classes scheduled')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
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
