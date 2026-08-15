import { test, expect } from '@playwright/test';
import path from 'path';
import { readFileSync } from 'fs';
import { createTestApiClient } from '../fixtures/data.js';

const FIXTURE_DIR = path.join(import.meta.dirname, '../fixtures/files');

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Expenses page', () => {
  test('shows Expenses page with New Expense button', async ({ page }) => {
    await page.goto('/expense');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Expense' })).toBeVisible();
  });

  test('opens New Expense dialog', async ({ page }) => {
    await page.goto('/expense');
    await page.getByRole('button', { name: 'New Expense' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('New Expense')).toBeVisible();
    await expect(dialog.getByLabel('Title')).toBeVisible();
    await expect(dialog.getByLabel(/Amount/i)).toBeVisible();
  });

  test('creates an expense entry via form', async ({ page }) => {
    const title = `E2E Expense ${Date.now()}`;
    const ids = getTestIds();

    await page.goto('/expense');
    await page.getByRole('button', { name: 'New Expense' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Category').fill('supplies');
    await dialog.getByLabel(/Amount/i).fill('2500');
    await dialog.getByLabel('Vendor').fill('Test Vendor');
    // Cost Center is the first select in the dialog; skip if no options available
    const costCenterSelect = dialog.locator('select').first();
    const costCenterOptions = await costCenterSelect.locator('option').count();
    if (costCenterOptions > 1) await costCenterSelect.selectOption({ index: 1 });

    await dialog.getByRole('button', { name: 'Submit' }).click();

    // Dialog closes, entry appears in list
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });

  test('expense entry created with attachment', async ({ page }) => {
    const title = `E2E Attach ${Date.now()}`;

    await page.goto('/expense');
    await page.getByRole('button', { name: 'New Expense' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Category').fill('misc');
    await dialog.getByLabel(/Amount/i).fill('500');

    // Attach a file
    await dialog.locator('input[type="file"]').setInputFiles(
      path.join(FIXTURE_DIR, 'students-valid.csv') // reuse as generic attachment
    );

    await dialog.getByRole('button', { name: 'Submit' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  });

  test('approves a pending expense', async ({ page }) => {
    const title = `E2E Approve ${Date.now()}`;
    const ids = getTestIds();

    // Create via UI first
    await page.goto('/expense');
    await page.getByRole('button', { name: 'New Expense' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Category').fill('test');
    await dialog.getByLabel(/Amount/i).fill('1500');
    await dialog.getByRole('button', { name: 'Submit' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });

    // Switch to Pending tab
    await page.getByRole('button', { name: 'Pending' }).click();
    await page.waitForLoadState('networkidle');

    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 10_000 });

    const approveBtn = row.getByRole('button', { name: 'Approve' });
    await approveBtn.click();

    // Status badge changes — row no longer shows Approve button
    await expect(approveBtn).not.toBeVisible({ timeout: 8_000 });
  });

  test('rejects a pending expense with comment', async ({ page }) => {
    const title = `E2E Reject ${Date.now()}`;

    await page.goto('/expense');
    await page.getByRole('button', { name: 'New Expense' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Category').fill('test');
    await dialog.getByLabel(/Amount/i).fill('1500');
    await dialog.getByRole('button', { name: 'Submit' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });

    await page.getByRole('button', { name: 'Pending' }).click();
    await page.waitForLoadState('networkidle');

    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 10_000 });

    await row.getByRole('button', { name: 'Reject' }).click();

    const rejectDialog = page.getByRole('dialog');
    await expect(rejectDialog).toBeVisible();
    await rejectDialog.locator('textarea').fill('Budget exceeded');
    await rejectDialog.getByRole('button', { name: 'Reject' }).click();

    await expect(rejectDialog).not.toBeVisible({ timeout: 8_000 });
  });

  test('status tabs filter expenses correctly', async ({ page }) => {
    await page.goto('/expense');
    await page.waitForLoadState('networkidle');

    for (const tab of ['All', 'Pending', 'Approved', 'Rejected']) {
      await page.getByRole('button', { name: tab }).click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('.text-destructive').filter({ hasText: /Failed to load/ })).not.toBeVisible();
    }
  });
});
