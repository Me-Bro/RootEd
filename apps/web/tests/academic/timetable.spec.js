import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { AUTH_STATES } from '../fixtures/auth.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

async function selectYearAndSection(page, yearId, sectionId) {
  await page.locator('select').nth(0).selectOption(yearId);
  await page.locator('select').nth(1).selectOption(sectionId);
}

async function fillEntryForm(page, { teacherName, subjectName, startTime, endTime, room }) {
  await page.getByLabel('Teacher').click();
  await page.getByRole('option', { name: teacherName }).click();
  await page.getByLabel('Subject').click();
  await page.getByRole('option', { name: subjectName }).click();
  await page.getByLabel('Start Time').fill(startTime);
  await page.getByLabel('End Time').fill(endTime);
  if (room) await page.getByLabel('Room (optional)').fill(room);
}

// 2025-06-02 is a Monday, inside the seeded 2025-26 academic year and within
// Alice Smith's Monday/period-1 Mathematics slot (09:00-09:45) for section A.
const MONDAY_DURING_MATH = '2025-06-02T09:15:00';

test.describe('Timetable page', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test.beforeEach(async ({ page }) => {
    await page.goto('/academic/timetable');
    await page.waitForLoadState('networkidle');
  });

  test('renders grid with seeded entry, showing time and room', async ({ page }) => {
    const { academicYear, section } = getTestIds();
    await selectYearAndSection(page, academicYear._id, section._id);

    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByText('09:00–09:45 · Room 101')).toBeVisible();
    await expect(page.getByText('Published')).toBeVisible();
  });

  test('adding an entry to an empty cell creates it', async ({ page }) => {
    const { academicYear, section } = getTestIds();
    await selectYearAndSection(page, academicYear._id, section._id);

    // Rows render in period order (1-8) — period 4 is row index 3, and is
    // empty in the seed data. Monday is the first day column.
    const row = page.locator('tbody tr').nth(3);
    await row.getByRole('button', { name: '+ Add' }).first().click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await fillEntryForm(page, {
      teacherName: 'Alice Smith',
      subjectName: 'English',
      startTime: '11:15',
      endTime: '12:00',
    });
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('11:15–12:00')).toBeVisible();
  });

  test('adding a conflicting teacher in another section is rejected with 409', async ({ page }) => {
    const { academicYear, sectionB } = getTestIds();
    await selectYearAndSection(page, academicYear._id, sectionB._id);

    // Section B's Monday/period-1 cell is empty, but Alice Smith already
    // teaches section A at that exact day/period (seeded).
    const row = page.locator('tbody tr').first();
    await row.getByRole('button', { name: '+ Add' }).first().click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await fillEntryForm(page, {
      teacherName: 'Alice Smith',
      subjectName: 'Mathematics',
      startTime: '09:00',
      endTime: '09:45',
    });
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(page.getByText(/Teacher already has a class/)).toBeVisible({ timeout: 8_000 });
  });

  test('editing an existing entry updates its time', async ({ page }) => {
    const { academicYear, section } = getTestIds();
    await selectYearAndSection(page, academicYear._id, section._id);

    await page.getByText('09:45–10:30').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('End Time').fill('10:45');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('09:45–10:45')).toBeVisible();
  });

  test('deleting an entry reverts the cell to Add', async ({ page }) => {
    const { academicYear, sectionB } = getTestIds();
    await selectYearAndSection(page, academicYear._id, sectionB._id);

    const row = page.locator('tbody tr').nth(2); // period 3, seeded entry for section B
    const mondayCell = row.locator('td').nth(1); // Period column, then Monday
    await expect(mondayCell.getByText('10:30–11:15')).toBeVisible();
    await mondayCell.getByTitle('Remove').click();

    await expect(mondayCell.getByRole('button', { name: '+ Add' })).toBeVisible({ timeout: 8_000 });
  });

  test('copying from another year populates the target grid', async ({ page }) => {
    const { academicYear, nextAcademicYear, section } = getTestIds();
    await selectYearAndSection(page, nextAcademicYear._id, section._id);
    await expect(page.getByText('Draft')).toBeVisible();

    await page.getByRole('button', { name: 'Copy from another year' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Source Academic Year').click();
    await page.getByRole('option', { name: academicYear.name ?? '2025-26' }).click();
    await page.getByRole('button', { name: 'Copy', exact: true }).click();

    await expect(page.getByText(/Copied \d+, skipped \d+/)).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByText('09:00–09:45 · Room 101')).toBeVisible();
  });

  test('publishing and unpublishing toggles the badge', async ({ page }) => {
    // Uses nextAcademicYear + sectionB — a combination no other test reads
    // or mutates — so toggling publish state here can't race the visibility
    // test's assertions about section A/B's published state.
    const { nextAcademicYear, sectionB } = getTestIds();
    await selectYearAndSection(page, nextAcademicYear._id, sectionB._id);

    await expect(page.getByText('Draft')).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByText('Published')).toBeVisible({ timeout: 8_000 });

    await page.getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByText('Draft')).toBeVisible({ timeout: 8_000 });
  });

  test('shows day chips with full names and no horizontal-scroll grid on narrow viewports', async ({
    page,
  }) => {
    const { academicYear, section } = getTestIds();
    // Tuesday/period-1 for section A (Science, Alice Smith, 09:00-09:45, no
    // room) — untouched by any other test in this file, so safe to assert on.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/academic/timetable?sectionId=${section._id}&yearId=${academicYear._id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('table')).toBeHidden();
    await expect(page.getByRole('tablist', { name: 'Day of week' })).toBeVisible();

    await page.getByRole('tab', { name: 'Tue' }).click();
    await expect(page.getByText('Science')).toBeVisible();
    await expect(page.getByText('Alice Smith')).toBeVisible();
    await expect(page.getByText('09:00')).toBeVisible();
  });

  test('shows an empty state for a day with no periods scheduled', async ({ page }) => {
    const { academicYear, section } = getTestIds();
    // Wednesday has no seeded entries for section A in any test in this file.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/academic/timetable?sectionId=${section._id}&yearId=${academicYear._id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: 'Wed' }).click();
    await expect(page.getByText('No classes scheduled')).toBeVisible();
  });

  test('highlights the current period on mobile when viewing today', async ({ page }) => {
    const { academicYear, section } = getTestIds();
    await page.clock.install({ time: new Date(MONDAY_DURING_MATH) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/academic/timetable?sectionId=${section._id}&yearId=${academicYear._id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: 'Mon' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Mathematics')).toBeVisible();
    await expect(page.getByText('now', { exact: true })).toBeVisible();
  });
});

test.describe('Timetable visibility (teacher)', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('draft sections are hidden from non-admins until published', async ({ page }) => {
    const { academicYear, section, sectionB } = getTestIds();
    await page.goto('/academic/timetable');
    await page.waitForLoadState('networkidle');

    // Section B is unpublished (draft) — teacher sees an empty grid.
    await selectYearAndSection(page, academicYear._id, sectionB._id);
    await expect(page.locator('tbody tr').first().getByText('10:30–11:15')).toHaveCount(0);

    // Section A is published — teacher sees its entries.
    await selectYearAndSection(page, academicYear._id, section._id);
    await expect(page.getByText('09:00–09:45 · Room 101')).toBeVisible();
  });
});
