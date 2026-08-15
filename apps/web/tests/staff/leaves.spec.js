import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestApiClient } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Leave Requests', () => {
  let leaveRequestId;

  test.beforeAll(async ({ request }) => {
    // Create a leave request via API so approval flow can be tested
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const dayAfter = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);

    const res = await client.post('/staff/leave-requests', {
      staffId: ids.staffMembers[0]._id,
      leaveTypeId: ids.leaveType._id,
      fromDate: tomorrow,
      toDate: dayAfter,
      reason: 'E2E test leave request',
    });

    if (res.ok()) {
      const data = await res.json();
      leaveRequestId = data._id;
    }
  });

  test('shows Leave Requests page with tabs', async ({ page }) => {
    await page.goto('/staff/leaves');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Leave Requests' })).toBeVisible();
    await expect(page.getByRole('button', { name: /All Requests/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pending Approval/i })).toBeVisible();
  });

  test('pending tab shows the created request', async ({ page }) => {
    test.skip(!leaveRequestId, 'Leave request creation failed in beforeAll');

    await page.goto('/staff/leaves');
    await page.waitForLoadState('networkidle');

    // Switch to Pending tab
    await page.getByRole('button', { name: /Pending Approval/i }).click();
    await page.waitForLoadState('networkidle');

    // Should show Approve and Reject buttons for pending requests
    await expect(page.getByRole('button', { name: 'Approve' }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('approves a pending leave request', async ({ page }) => {
    test.skip(!leaveRequestId, 'Leave request creation failed in beforeAll');

    await page.goto('/staff/leaves');
    await page.getByRole('button', { name: /Pending Approval/i }).click();
    await page.waitForLoadState('networkidle');

    const approveBtn = page.getByRole('button', { name: 'Approve' }).first();
    await expect(approveBtn).toBeVisible({ timeout: 10_000 });
    await approveBtn.click();

    // Wait for mutation to settle (button re-enables) and verify no error
    await expect(approveBtn).not.toBeDisabled({ timeout: 8_000 });
    await expect(page.locator('.text-destructive')).not.toBeVisible();
  });

  test('rejects a leave request with comment', async ({ page }) => {
    // Create a fresh leave request to reject
    const ids = getTestIds();
    const client = await createTestApiClient(page.request, 'super_admin');

    const d1 = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const d2 = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);
    await client.post('/staff/leave-requests', {
      staffId: ids.staffMembers[1]._id,
      leaveTypeId: ids.leaveType._id,
      fromDate: d1,
      toDate: d2,
      reason: 'Reject test leave',
    });

    await page.goto('/staff/leaves');
    await page.getByRole('button', { name: /Pending Approval/i }).click();
    await page.waitForLoadState('networkidle');

    const rejectBtn = page.getByRole('button', { name: 'Reject' }).first();
    await expect(rejectBtn).toBeVisible({ timeout: 10_000 });
    await rejectBtn.click();

    // Reject dialog appears
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('textarea').fill('Not approved due to schedule conflict');
    await dialog.getByRole('button', { name: 'Reject' }).click();

    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
  });

  test('status filter works on All tab', async ({ page }) => {
    await page.goto('/staff/leaves');
    await page.waitForLoadState('networkidle');

    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('approved');
    await page.waitForLoadState('networkidle');

    // Table refreshes — no error state
    await expect(page.locator('.text-destructive')).not.toBeVisible();
  });
});
