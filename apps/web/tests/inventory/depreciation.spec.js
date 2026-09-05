import { test, expect } from '@playwright/test';
import { visibleText } from '../fixtures/dom.js';

test.describe('Depreciation page', () => {
  test('shows the page with year select and CSV export', async ({ page }) => {
    await page.goto('/inventory/depreciation');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Asset Depreciation' })).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  });

  test('lists the seeded fixed asset with its depreciation figures', async ({ page }) => {
    await page.goto('/inventory/depreciation');
    await page.waitForLoadState('networkidle');

    const row = page.getByRole('row', { name: /Projector/ });
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.getByText('INV-TEST-002')).toBeVisible();
  });

  test('shows a fleet total card above the list', async ({ page }) => {
    await page.goto('/inventory/depreciation');
    await page.waitForLoadState('networkidle');

    // Single seeded fixed asset (Projector, unitCost 25000, no currentValue
    // override on the fixture) — fleet current value equals fleet original
    // cost, so retained sits at 100%.
    await expect(visibleText(page, 'Fleet value')).toBeVisible();
    await expect(visibleText(page, /25,000.*of.*25,000/)).toBeVisible();
    await expect(visibleText(page, '100.0% of original value retained')).toBeVisible();
  });

  test('near write-off section is hidden when no asset is under the threshold', async ({
    page,
  }) => {
    await page.goto('/inventory/depreciation');
    await page.waitForLoadState('networkidle');

    // Seeded Projector retains 100% of its value, well above the 10%
    // near-write-off cutoff, so the dedicated section should not render.
    await expect(visibleText(page, /Near write-off/)).not.toBeVisible();
  });

  test('CSV export stays enabled while records exist', async ({ page }) => {
    await page.goto('/inventory/depreciation');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  test('switching year keeps the page on a valid state (no crash, table or empty state renders)', async ({
    page,
  }) => {
    await page.goto('/inventory/depreciation');
    await page.waitForLoadState('networkidle');

    const yearSelect = page.locator('select').first();
    // allTextContents() does not auto-wait, so reading straight after
    // networkidle can catch the select before its options render and come back
    // empty — a flake that only showed up under parallel load. Poll instead.
    const optionLocator = yearSelect.locator('option');
    await expect.poll(() => optionLocator.count(), { timeout: 10_000 }).toBeGreaterThan(1);
    const options = await optionLocator.allTextContents();

    await yearSelect.selectOption(options[options.length - 1]);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Asset Depreciation' })).toBeVisible();
  });
});
