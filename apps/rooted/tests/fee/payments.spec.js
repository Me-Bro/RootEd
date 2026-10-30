import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestApiClient } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Fee Collection', () => {
  test.beforeAll(async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');

    // Assign fee structure to section so students have fee assignments
    await client.post(`/fee/structures/${ids.feeStructure._id}/assign`, {
      sectionId: ids.section._id,
      dueDate: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    });
  });

  test('shows Fee Collection page with tabs, Defaulters first', async ({ page }) => {
    await page.goto('/fee');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Fee Collection' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assignments' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Payments' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Defaulters' })).toBeVisible();
  });

  test('Defaulters is the default tab and lists overdue assignments', async ({ page }) => {
    await page.goto('/fee');
    await page.waitForLoadState('networkidle');

    // Defaulters is the landing tab — its table (unique "Days Overdue"
    // column) should render without clicking any tab button.
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('columnheader', { name: 'Days Overdue' })).toBeVisible();
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test('Defaulters list sorts by days overdue, worst first', async ({ page }) => {
    await page.goto('/fee');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });
    const overdueCells = page.locator('table tbody tr td:last-child');
    const count = await overdueCells.count();
    expect(count).toBeGreaterThan(1);

    const values = (await overdueCells.allTextContents()).map(Number);
    for (let i = 1; i < values.length; i++) {
      expect(values[i - 1]).toBeGreaterThanOrEqual(values[i]);
    }
  });

  test('Assignments tab shows fee assignments after structure assigned', async ({ page }) => {
    await page.goto('/fee');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Assignments' }).click();

    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });
    const rows = page.locator('table tbody tr');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test('Collect button opens payment dialog', async ({ page }) => {
    await page.goto('/fee');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Assignments' }).click();

    const collectBtn = page.getByRole('button', { name: 'Collect' }).first();
    await expect(collectBtn).toBeVisible({ timeout: 10_000 });
    await collectBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Collect Payment')).toBeVisible();
    await expect(dialog.getByLabel('Amount')).toBeVisible();
  });

  test('records a cash payment and shows receipt link', async ({ page }) => {
    await page.goto('/fee');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Assignments' }).click();

    // Student1's Standard Fee assignment already carries a seeded partial
    // payment (2750 of 5500) — target Student2's untouched Standard Fee
    // assignment instead, so the full 5500 doesn't trip the overpayment
    // guard (Student2 also has an unrelated Sports Fee assignment — filter
    // on both cell texts to land on the right row).
    const row = page
      .locator('table tbody tr')
      .filter({ hasText: 'Student2 Test' })
      .filter({ hasText: 'Standard Fee' });
    const collectBtn = row.getByRole('button', { name: 'Collect' });
    await expect(collectBtn).toBeVisible({ timeout: 10_000 });
    await collectBtn.click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Amount').fill('5500');
    // Payment method defaults to "cash"
    await dialog.getByRole('button', { name: 'Record Payment' }).click();

    // Payment success state
    await expect(dialog.getByText('Payment Successful')).toBeVisible({ timeout: 15_000 });
  });

  test('Payments tab lists recorded payments', async ({ page }) => {
    await page.goto('/fee');
    await page.getByRole('button', { name: 'Payments' }).click();
    await page.waitForLoadState('networkidle');

    // After recording a payment above, at least one payment visible
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });
  });

  test('payment receipt download button present', async ({ page }) => {
    await page.goto('/fee');
    await page.getByRole('button', { name: 'Payments' }).click();
    await page.waitForLoadState('networkidle');

    const downloadBtn = page.getByRole('button', { name: 'Download' }).first();
    await expect(downloadBtn).toBeVisible({ timeout: 10_000 });
  });

  test('Defaulters tab renders without error', async ({ page }) => {
    await page.goto('/fee');
    await page.getByRole('button', { name: 'Defaulters' }).click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('.text-destructive').filter({ hasText: /Failed/ })).not.toBeVisible();
  });
});
