import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Rebuilt per docs/mobile-ui/04-attendance-report-approved.html: worst-attendance-first
// list with a defaulter ring + share card, replacing the old alphabetical table + CSV-only UI.
//
// Seeded range with no per-period (subject) records mixed in, so period-level pct math is
// easy to reason about: student 1 has 1 absence in 4 days (75%, exactly at the threshold —
// not a defaulter), student 2 has 3 absences in 4 days (25% — a defaulter), and every other
// active student is present all 4 days (100%). See seed-test-data.js's attendance block.
// Class average over the window: 36 present / 40 student-days = 90%.
const FROM = '2025-06-02';
const TO = '2025-06-05';

test.describe('Attendance report page', () => {
  test('loads via deep link with an explicit date range, shows the class average ring and defaulter count', async ({
    page,
  }) => {
    const { section } = getTestIds();

    await page.goto(`/academic/attendance/report?sectionId=${section._id}&from=${FROM}&to=${TO}`);

    await expect(page.getByRole('heading', { name: 'Attendance Report' })).toBeVisible();
    await expect(page.getByText('90%', { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('1 below 75%')).toBeVisible();
  });

  test('sorts worst-attendance-first by default, not alphabetically', async ({ page }) => {
    const { section } = getTestIds();

    await page.goto(`/academic/attendance/report?sectionId=${section._id}&from=${FROM}&to=${TO}`);
    const rows = page.locator('.divide-y > div');
    await rows.first().waitFor({ timeout: 10_000 });

    const rowTexts = await rows.allTextContents();
    const idx002 = rowTexts.findIndex((t) => t.includes('2025-TEST-002'));
    const idx001 = rowTexts.findIndex((t) => t.includes('2025-TEST-001'));

    expect(idx002).toBe(0); // the 25% defaulter is worst-attendance and sorts first
    expect(idx002).toBeLessThan(idx001); // ahead of the 75% (non-defaulter) student
  });

  test('the defaulter with no guardian phone on file gets "Add contact", not a dead Call tap', async ({
    page,
  }) => {
    const { section } = getTestIds();

    await page.goto(`/academic/attendance/report?sectionId=${section._id}&from=${FROM}&to=${TO}`);
    const rows = page.locator('.divide-y > div');
    await rows.first().waitFor({ timeout: 10_000 });

    const defaulterRow = rows.filter({ hasText: '2025-TEST-002' });
    await expect(defaulterRow.getByRole('link', { name: 'Add contact' })).toBeVisible();
    await expect(defaulterRow.getByRole('button', { name: 'Call' })).toHaveCount(0);

    // Student 1 is not a defaulter (75%, not below the threshold), so it gets
    // neither action — no Call chip, no Add-contact link.
    const nonDefaulterRow = rows.filter({ hasText: '2025-TEST-001' });
    await expect(nonDefaulterRow.getByRole('link', { name: 'Add contact' })).toHaveCount(0);
    await expect(nonDefaulterRow.getByRole('button', { name: 'Call' })).toHaveCount(0);
  });

  test('exports the report as CSV (secondary action)', async ({ page }) => {
    const { section } = getTestIds();

    await page.goto(`/academic/attendance/report?sectionId=${section._id}&from=${FROM}&to=${TO}`);
    await page.locator('.divide-y > div').first().waitFor({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/attendance-report-.*\.csv/);
  });

  test('"Share summary card" is the primary action and produces a shareable image', async ({
    page,
  }) => {
    const { section } = getTestIds();

    await page.goto(`/academic/attendance/report?sectionId=${section._id}&from=${FROM}&to=${TO}`);
    await page.locator('.divide-y > div').first().waitFor({ timeout: 10_000 });

    // Headless Chromium has no Web Share API, so the component falls back to
    // downloading the rendered canvas as a PNG — still a deterministic,
    // testable outcome of the same "render to canvas" code path.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Share summary card' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('attendance-summary.png');
  });

  test('with no explicit date range, the default last-30-days window makes the 2025 seed history unreachable — every student shows no history', async ({
    page,
  }) => {
    const { section } = getTestIds();

    await page.goto(`/academic/attendance/report?sectionId=${section._id}`);

    await expect(page.getByText('0 below 75% — nobody to call today')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('no history').first()).toBeVisible();
  });

  test('a failed report fetch shows a retry banner instead of crashing', async ({ page }) => {
    const { section } = getTestIds();

    // The glob also matches the page's own top-level navigation (same path) —
    // only abort the API fetch, or page.goto itself fails with net::ERR_FAILED.
    await page.route('**/attendance/report**', (route) =>
      route.request().resourceType() === 'document' ? route.continue() : route.abort('failed')
    );
    await page.goto(`/academic/attendance/report?sectionId=${section._id}&from=${FROM}&to=${TO}`);

    // React Query's default retry (3 attempts, exponential backoff) runs before
    // isError settles, so give this one more headroom than the happy-path tests.
    await expect(page.getByText('Failed to load attendance report.')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
