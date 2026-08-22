import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Rebuilt per docs/mobile-ui/15-budgets-approved.html: the only change from the desktop
// screen is a client-side sort — worst-utilization-first instead of insertion order — plus
// a "—" fallback for cost centers with no cap set. No new components, no filter/search/tabs;
// the year select, Set Budget modal, and UtilizationBar are unchanged from desktop. The real
// seed only has one cost center, so the sort/edge-case tests mock the /expense/budgets
// response directly (precedent: report-cards.spec.js's job-polling mocks).
test.describe('Budgets page', () => {
  test('shows Budgets page with Set Budget button', async ({ page }) => {
    await page.goto('/expense/budgets');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set Budget' })).toBeVisible();
  });

  test('opens the Set Budget dialog', async ({ page }) => {
    await page.goto('/expense/budgets');
    await page.getByRole('button', { name: 'Set Budget' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Set Budget', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('Cap Amount (INR)')).toBeVisible();
    await expect(dialog.getByLabel('Year')).toBeVisible();
  });

  test('sorts by utilization descending, worst first — not insertion order', async ({ page }) => {
    const { costCenter } = getTestIds();

    // Deliberately inserted in a non-sorted order (Academics, Transport, Facilities) so a
    // pass here can't be an accident of the mock's own ordering.
    await page.route('**/expense/budgets**', async (route) => {
      // The glob also matches this page's own top-level navigation — only mock the API fetch.
      if (route.request().resourceType() === 'document') return route.continue();
      await route.fulfill({
        json: [
          {
            _id: 'b-academics',
            costCenterId: { _id: costCenter._id, name: 'Academics' },
            period: 'annual',
            cap: 1800000,
            spent: 893000, // 50%
          },
          {
            _id: 'b-transport',
            costCenterId: { _id: costCenter._id, name: 'Transport' },
            period: 'annual',
            cap: 1600000,
            spent: 1340000, // 84%
          },
          {
            _id: 'b-facilities',
            costCenterId: { _id: costCenter._id, name: 'Facilities' },
            period: 'annual',
            cap: 600000,
            spent: 354000, // 59%
          },
        ],
      });
    });

    await page.goto('/expense/budgets');
    const rows = page.getByRole('row').filter({ hasText: /Academics|Transport|Facilities/ });
    await rows.first().waitFor({ timeout: 10_000 });

    const rowTexts = await rows.allTextContents();
    const idxTransport = rowTexts.findIndex((t) => t.includes('Transport')); // 84%
    const idxFacilities = rowTexts.findIndex((t) => t.includes('Facilities')); // 59%
    const idxAcademics = rowTexts.findIndex((t) => t.includes('Academics')); // 50%

    expect(idxTransport).toBe(0);
    expect(idxTransport).toBeLessThan(idxFacilities);
    expect(idxFacilities).toBeLessThan(idxAcademics);
  });

  test('a budget with no cap set shows "—" utilization and always sorts last', async ({ page }) => {
    const { costCenter } = getTestIds();

    await page.route('**/expense/budgets**', async (route) => {
      // The glob also matches this page's own top-level navigation — only mock the API fetch.
      if (route.request().resourceType() === 'document') return route.continue();
      await route.fulfill({
        json: [
          {
            _id: 'b-nocap',
            costCenterId: { _id: costCenter._id, name: 'Uncapped Center' },
            period: 'annual',
            cap: 0,
            spent: 5000,
          },
          {
            _id: 'b-transport',
            costCenterId: { _id: costCenter._id, name: 'Transport' },
            period: 'annual',
            cap: 1600000,
            spent: 1340000, // 84%
          },
        ],
      });
    });

    await page.goto('/expense/budgets');
    const rows = page.getByRole('row').filter({ hasText: /Transport|Uncapped Center/ });
    await rows.first().waitFor({ timeout: 10_000 });

    const rowTexts = await rows.allTextContents();
    expect(rowTexts[0]).toContain('Transport');
    expect(rowTexts[1]).toContain('Uncapped Center');
    expect(rowTexts[1]).toContain('—');
  });

  test('shows the "No budgets configured" empty state when none exist for the year', async ({
    page,
  }) => {
    await page.route('**/expense/budgets**', async (route) => {
      // The glob also matches this page's own top-level navigation — only mock the API fetch.
      if (route.request().resourceType() === 'document') return route.continue();
      await route.fulfill({ json: [] });
    });

    await page.goto('/expense/budgets');
    await expect(page.getByText('No budgets configured')).toBeVisible({ timeout: 10_000 });
  });
});
