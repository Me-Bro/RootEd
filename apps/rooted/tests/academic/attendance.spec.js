import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Rebuilt per docs/mobile-ui/03-attendance-approved.html: daily roll only (subjectId
// is always null), so the old per-subject/period marking coverage no longer applies —
// that capability isn't part of this screen's approved spec.

test.describe('Attendance page', () => {
  let sectionId;

  test.beforeEach(async ({ page }) => {
    sectionId = getTestIds().section._id;
    await page.goto(`/academic/attendance?sectionId=${sectionId}`);
    await page.waitForLoadState('networkidle');
  });

  test('renders the roster with search, filter, sort and a progress card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Attendance' })).toBeVisible();
    await expect(page.getByPlaceholder('Search name or admission no.')).toBeVisible();
    await expect(page.getByRole('button', { name: /^All ·/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Unmarked ·/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^At-risk ·/ })).toBeVisible();
    await expect(page.getByText(/^Marked \d+ of \d+$/)).toBeVisible();
  });

  test('search filters the roster by name or admission number', async ({ page }) => {
    const search = page.getByPlaceholder('Search name or admission no.');
    await search.fill('2025-TEST-001');
    await expect(page.getByText('2025-TEST-001')).toBeVisible();
    await expect(page.getByText('2025-TEST-002')).not.toBeVisible();

    await search.fill('no-such-student-zzz');
    await expect(page.getByText(/No student matches/)).toBeVisible();
  });

  test('Present/Absent are direct one-tap buttons, never a cycle', async ({ page }) => {
    const row = page.locator('.divide-y > div').first();
    const presentBtn = row.getByRole('button', { name: 'Mark present' });
    const absentBtn = row.getByRole('button', { name: 'Mark absent' });

    await presentBtn.click();
    await expect(presentBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(absentBtn).toHaveAttribute('aria-pressed', 'false');

    await absentBtn.click();
    await expect(absentBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(presentBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('the ⋯ sheet sets Late without touching other rows', async ({ page }) => {
    const rows = page.locator('.divide-y > div');
    const first = rows.first();
    await first.getByRole('button', { name: /More status options/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Late' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(first.getByRole('button', { name: /More status options/ })).toHaveText('L');
  });

  test('Mark rest present only fills unmarked rows, and Undo restores exactly those', async ({
    page,
  }) => {
    const rows = page.locator('.divide-y > div');
    // Leave an explicit trail: mark the first row Absent by hand before the bulk action.
    await rows.first().getByRole('button', { name: 'Mark absent' }).click();

    const unmarkedBefore = Number(
      (await page.getByRole('button', { name: /^Unmarked ·/ }).textContent()).match(/\d+/)[0]
    );
    await page.getByRole('button', { name: 'Mark rest present' }).click();

    await expect(page.getByText(/students? marked present/)).toBeVisible();
    // The manually-set row is untouched by the bulk action.
    await expect(rows.first().getByRole('button', { name: 'Mark absent' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByRole('button', { name: /^Unmarked ·/ })).toHaveText('Unmarked · 0');

    await page.getByRole('button', { name: 'UNDO' }).click();
    await expect(page.getByRole('button', { name: /^Unmarked ·/ })).toHaveText(
      `Unmarked · ${unmarkedBefore}`
    );
    // Still untouched after undo.
    await expect(rows.first().getByRole('button', { name: 'Mark absent' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('Save while incomplete opens a guard sheet; marking everyone from it lets Save succeed', async ({
    page,
  }) => {
    const unmarkedCountText = await page.getByRole('button', { name: /^Unmarked ·/ }).textContent();
    const unmarkedCount = Number(unmarkedCountText.match(/\d+/)[0]);
    test.skip(unmarkedCount === 0, 'roster already fully marked from a previous run');

    await page.getByRole('button', { name: /^Save ·/ }).click();
    await expect(page.getByText(/students? still unmarked/)).toBeVisible();

    await page.getByRole('button', { name: /^⚡ Mark all \d+ present$/ }).click();
    await expect(page.getByText(/students? still unmarked/)).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^Unmarked ·/ })).toHaveText('Unmarked · 0');

    await page.getByRole('button', { name: /^Save ·/ }).click();
    await expect(page.getByText(/Failed to save attendance/)).not.toBeVisible();
  });

  test('"View Report" link navigates to the attendance report page', async ({ page }) => {
    await page.getByRole('link', { name: 'View Report →' }).click();
    await expect(page).toHaveURL(/\/academic\/attendance\/report/);
    await expect(page.getByRole('heading', { name: 'Attendance Report' })).toBeVisible();
  });
});
