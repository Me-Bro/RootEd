import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestApiClient } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

function daysFromNow(n) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

test.describe('Leave request hardening', () => {
  test.describe('as teacher', () => {
    test.use({ storageState: 'tests/fixtures/.auth/teacher.json' });

    test('teacher files their own leave request via the Apply modal', async ({ page }) => {
      await page.goto('/staff/leaves');
      await page.waitForLoadState('networkidle');

      const applyBtn = page.getByRole('button', { name: 'Apply for Leave' });
      await expect(applyBtn).toBeEnabled({ timeout: 10_000 });
      await applyBtn.click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('select').selectOption({ index: 1 });
      await dialog.locator('input[type="date"]').first().fill(daysFromNow(30));
      await dialog.locator('input[type="date"]').last().fill(daysFromNow(31));
      await dialog.getByRole('button', { name: 'Submit' }).click();

      await expect(dialog).not.toBeVisible({ timeout: 8_000 });
      await expect(page.locator('.text-destructive')).not.toBeVisible();
    });

    test('teacher cannot see Approve/Reject buttons anywhere on the page', async ({ page }) => {
      await page.goto('/staff/leaves');
      await page.getByRole('button', { name: /Pending Approval/i }).click();
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0);
    });

    test('staff can cancel their own pending leave request', async ({ page, request }) => {
      const ids = getTestIds();
      const client = await createTestApiClient(request, 'teacher');

      const created = await client.post('/staff/leave-requests', {
        staffId: ids.staffMembers[0]._id,
        leaveTypeId: ids.leaveType._id,
        fromDate: daysFromNow(50),
        toDate: daysFromNow(51),
        reason: 'To be cancelled',
      });
      expect(created.ok()).toBe(true);

      await page.goto('/staff/leaves');
      await page.getByRole('button', { name: /Pending Approval/i }).click();
      await page.waitForLoadState('networkidle');

      const cancelBtn = page.getByRole('button', { name: 'Cancel' }).first();
      await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
      await cancelBtn.click();
      await expect(cancelBtn).not.toBeDisabled({ timeout: 8_000 });
      await expect(page.locator('.text-destructive')).not.toBeVisible();
    });
  });

  test('a teacher cannot file leave on behalf of another staff member', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'teacher');

    const res = await client.post('/staff/leave-requests', {
      staffId: ids.staffMembers[1]._id,
      leaveTypeId: ids.leaveType._id,
      fromDate: daysFromNow(32),
      toDate: daysFromNow(33),
      reason: 'Should be rejected',
    });

    expect(res.status()).toBe(403);
  });

  test('an overlapping pending leave request is rejected', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'teacher');

    const first = await client.post('/staff/leave-requests', {
      staffId: ids.staffMembers[0]._id,
      leaveTypeId: ids.leaveType._id,
      fromDate: daysFromNow(40),
      toDate: daysFromNow(41),
      reason: 'First block',
    });
    expect(first.ok()).toBe(true);

    const overlapping = await client.post('/staff/leave-requests', {
      staffId: ids.staffMembers[0]._id,
      leaveTypeId: ids.leaveType._id,
      fromDate: daysFromNow(41),
      toDate: daysFromNow(42),
      reason: 'Overlaps the first block',
    });
    expect(overlapping.status()).toBe(409);
  });

  test.describe('as tenant_admin', () => {
    test.use({ storageState: 'tests/fixtures/.auth/tenant_admin.json' });

    test('tenant_admin can add a new leave type', async ({ page }) => {
      const name = `Sabbatical ${Date.now()}`;

      await page.goto('/staff/leaves');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Add Leave Type' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByLabel('Name').fill(name);
      await dialog.getByLabel('Max Days / Year').fill('7');
      await dialog.getByRole('button', { name: 'Save' }).click();

      await expect(dialog).not.toBeVisible({ timeout: 8_000 });
      await expect(page.getByText(name)).toBeVisible({ timeout: 8_000 });
    });
  });

  test('approval chain enforces order — the second approver cannot act before the first', async ({
    request,
  }) => {
    const ids = getTestIds();
    const adminClient = await createTestApiClient(request, 'tenant_admin');

    const created = await adminClient.post('/staff/leave-requests', {
      staffId: ids.staffMembers[0]._id,
      leaveTypeId: ids.leaveType._id,
      fromDate: daysFromNow(60),
      toDate: daysFromNow(61),
      reason: 'Chain order test',
    });
    expect(created.ok()).toBe(true);
    const leaveReq = await created.json();
    expect(leaveReq.approvalChain.length).toBeGreaterThanOrEqual(2);

    const tenantAdminId = ids.users.tenant_admin._id;
    const principalId = ids.users.principal._id;
    const firstApproverId = leaveReq.approvalChain[0].approverId;
    const firstIsTenantAdmin = firstApproverId === tenantAdminId;
    const firstRole = firstIsTenantAdmin ? 'tenant_admin' : 'principal';
    const secondRole = firstIsTenantAdmin ? 'principal' : 'tenant_admin';
    expect([tenantAdminId, principalId]).toContain(firstApproverId);

    const secondClient = await createTestApiClient(request, secondRole);
    const outOfTurn = await secondClient.patch(`/staff/leave-requests/${leaveReq._id}/approve`);
    expect(outOfTurn.status()).toBe(403);

    const firstClient = await createTestApiClient(request, firstRole);
    const firstApproval = await firstClient.patch(`/staff/leave-requests/${leaveReq._id}/approve`);
    expect(firstApproval.ok()).toBe(true);
    expect((await firstApproval.json()).status).toBe('pending');

    const secondApproval = await secondClient.patch(
      `/staff/leave-requests/${leaveReq._id}/approve`
    );
    expect(secondApproval.ok()).toBe(true);
    expect((await secondApproval.json()).status).toBe('approved');
  });
});
