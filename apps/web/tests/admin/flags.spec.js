import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Runs against the real seeded flags (seed-test-flag-on / seed-test-flag-off)
// via the actual PATCH /admin/flags/:key endpoint — no mocking, since the
// backend for this page already existed and only the UI was placeholder.
test.describe('Flags page', () => {
  test('lists seeded flags with their initial enabled state', async ({ page }) => {
    await page.goto('/flags');
    await page.waitForLoadState('networkidle');

    const onRow = page.getByRole('row', { name: /seed-test-flag-on/ });
    const offRow = page.getByRole('row', { name: /seed-test-flag-off/ });
    await expect(onRow).toBeVisible();
    await expect(offRow).toBeVisible();
    await expect(onRow.getByText('Enabled', { exact: true })).toBeVisible();
    await expect(offRow.getByText('Disabled', { exact: true })).toBeVisible();
  });

  test('toggling a flag flips its state and persists across reload', async ({ page }) => {
    await page.goto('/flags');
    const offRow = page.getByRole('row', { name: /seed-test-flag-off/ });
    await offRow.waitFor();

    await offRow.getByRole('button', { name: 'Enable' }).click();
    await expect(offRow.getByText('Enabled', { exact: true })).toBeVisible();

    await page.reload();
    const reloadedRow = page.getByRole('row', { name: /seed-test-flag-off/ });
    await expect(reloadedRow.getByText('Enabled', { exact: true })).toBeVisible();

    // Restore original state so a re-run of this spec (without a fresh
    // `seed:test:clean`) starts from the same fixture the first test asserts.
    await reloadedRow.getByRole('button', { name: 'Disable' }).click();
    await expect(reloadedRow.getByText('Disabled', { exact: true })).toBeVisible();
  });

  test('creates a new flag via the New Flag dialog', async ({ page }) => {
    const { tenant } = getTestIds();
    const key = `e2e-created-flag-${tenant._id.slice(-6)}`;

    await page.goto('/flags');
    await page.getByRole('button', { name: 'New Flag' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Key').fill(key);
    await dialog.getByLabel('Description').fill('Created by e2e spec');
    await dialog.getByLabel('Enabled').check();
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(dialog).toBeHidden();
    const newRow = page.getByRole('row', { name: new RegExp(key) });
    await expect(newRow).toBeVisible();
    await expect(newRow.getByText('Enabled', { exact: true })).toBeVisible();
  });
});
