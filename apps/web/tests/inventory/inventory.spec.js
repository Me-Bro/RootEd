import { test, expect } from '@playwright/test';

// Rebuilt per docs/mobile-ui/18-inventory-approved.html: the desktop's 4 tabs
// (Items / Movements / Requisitions / Low Stock) stay, but an AttentionStrip
// now surfaces "low stock" and "not yet returned" counts above the tab bar so
// an admin can jump straight to the filtered view without hunting through tabs.

test.describe('Inventory page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');
  });

  test('shows the Inventory page with tabs and Add Item action', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Items' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Movements' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Requisitions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Low Stock' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Item' })).toBeVisible();
  });

  test('items tab lists seeded items and search filters them', async ({ page }) => {
    await expect(page.getByText('Whiteboard Marker')).toBeVisible();
    await page.getByPlaceholder('Search name or SKU…').fill('Projector');
    await expect(page.getByText('Projector')).toBeVisible();
    await expect(page.getByText('Whiteboard Marker')).not.toBeVisible();
  });

  test('creating a new item below its reorder level surfaces the low-stock strip and jumps to Low Stock', async ({
    page,
  }) => {
    const name = `E2E Low Stock Item ${Date.now()}`;

    await page.getByRole('button', { name: 'Add Item' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('Category').fill('e2e-supplies');
    await dialog.getByLabel('Initial Quantity').fill('2');
    await dialog.getByLabel('Reorder Level').fill('20');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    const lowStockChip = page.getByRole('button', { name: /items? low on stock/ });
    await expect(lowStockChip).toBeVisible({ timeout: 10_000 });

    await lowStockChip.click();

    // Jumped to the Low Stock tab — its table has a "Reorder Level" column
    // that no other tab renders, and the new item shows up in it.
    await expect(page.getByRole('columnheader', { name: 'Reorder Level' })).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });

  test('issuing an item surfaces the not-returned strip and jumps to filtered Movements', async ({
    page,
  }) => {
    const entityId = `E2E-STAFF-${Date.now()}`;

    // Issue the seeded fixed asset (Projector) — no quantity field involved,
    // keeps this test independent from the low-stock scenario above.
    const projectorRow = page.getByRole('row').filter({ hasText: 'Projector' });
    await projectorRow.getByRole('button', { name: 'Issue' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Entity ID').fill(entityId);
    await dialog.getByRole('button', { name: 'Issue' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });

    const notReturnedChip = page.getByRole('button', { name: /items? not yet returned/ });
    await expect(notReturnedChip).toBeVisible({ timeout: 10_000 });

    await notReturnedChip.click();

    // Jumped to Movements, pre-filtered to type=issue & returned=false —
    // the "Issued To" column (unique to Movements) is visible, and every
    // visible row is a still-open issue with a Return action.
    await expect(page.getByRole('columnheader', { name: 'Issued To' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: entityId });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Return' })).toBeVisible();

    // Clean up: return it so the not-returned count doesn't leak into other runs.
    await row.getByRole('button', { name: 'Return' }).click();
    await expect(row.getByRole('button', { name: 'Return' })).not.toBeVisible({ timeout: 10_000 });
  });

  test('Movements tab exposes a manual "Not yet returned" filter', async ({ page }) => {
    await page.getByRole('button', { name: 'Movements' }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('checkbox', { name: 'Not yet returned' })).toBeVisible();
  });
});
