import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestApiClient } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Fee Discount/Waive/Refund', () => {
  test('apply discount succeeds for a matching student-targeted discount', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'accountant');
    const res = await client.post(`/fee/assignments/${ids.discountTargetAssignment._id}/discount`, {
      discountId: ids.feeDiscountForStudent._id,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.discountAmount).toBe(200); // 20% of the 1000 assignment total
  });

  test('apply discount rejected when the discount does not target this student', async ({
    request,
  }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'accountant');
    // feeDiscountForStudent targets a different student than waiveTargetAssignment.
    const res = await client.post(`/fee/assignments/${ids.waiveTargetAssignment._id}/discount`, {
      discountId: ids.feeDiscountForStudent._id,
    });
    expect(res.status()).toBe(400);
  });

  test('apply discount 404s for a bogus discountId', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'accountant');
    const res = await client.post(`/fee/assignments/${ids.waiveTargetAssignment._id}/discount`, {
      discountId: '507f1f77bcf86cd799439011',
    });
    expect(res.status()).toBe(404);
  });

  test('waive succeeds, then a discount or a second waive on it is rejected', async ({
    request,
  }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'tenant_admin');

    const first = await client.post(`/fee/assignments/${ids.waiveTargetAssignment._id}/waive`, {
      reason: 'Financial hardship',
    });
    expect(first.status()).toBe(200);
    expect((await first.json()).status).toBe('waived');

    const secondWaive = await client.post(
      `/fee/assignments/${ids.waiveTargetAssignment._id}/waive`,
      {}
    );
    expect(secondWaive.status()).toBe(400);

    const discountOnWaived = await client.post(
      `/fee/assignments/${ids.waiveTargetAssignment._id}/discount`,
      { discountId: ids.feeDiscount._id }
    );
    expect(discountOnWaived.status()).toBe(400);
  });

  test('refund reverses a paid assignment, and a second refund is rejected', async ({
    request,
  }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'tenant_admin');

    // Sanity check the seeded starting state before mutating it.
    const before = await client.get(
      `/fee/assignments?studentId=${ids.refundTargetAssignment.studentId}`
    );
    const beforeAssignment = (await before.json()).find(
      (a) => a._id === ids.refundTargetAssignment._id
    );
    expect(beforeAssignment.status).toBe('paid');

    const refund = await client.post(`/fee/payments/${ids.refundTargetPayment._id}/refund`, {
      reason: 'Duplicate payment',
    });
    expect(refund.status()).toBe(200);
    expect((await refund.json()).refunded).toBe(true);

    const after = await client.get(
      `/fee/assignments?studentId=${ids.refundTargetAssignment.studentId}`
    );
    const afterAssignment = (await after.json()).find(
      (a) => a._id === ids.refundTargetAssignment._id
    );
    expect(afterAssignment.status).toBe('unpaid');

    const secondRefund = await client.post(
      `/fee/payments/${ids.refundTargetPayment._id}/refund`,
      {}
    );
    expect(secondRefund.status()).toBe(400);
  });

  test('accountant (fees:write/collect, no tenant:admin) gets 403 on waive and refund', async ({
    request,
  }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'accountant');

    const waiveRes = await client.post(
      `/fee/assignments/${ids.waiveTargetAssignment._id}/waive`,
      {}
    );
    expect(waiveRes.status()).toBe(403);

    const refundRes = await client.post(`/fee/payments/${ids.refundTargetPayment._id}/refund`, {});
    expect(refundRes.status()).toBe(403);
  });

  test('viewer (no fee permissions) gets 403 on apply discount', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'viewer');
    const res = await client.post(`/fee/assignments/${ids.waiveTargetAssignment._id}/discount`, {
      discountId: ids.feeDiscount._id,
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('Fee Actions UI', () => {
  test('applying a discount from the Assignments tab updates the Discount column', async ({
    page,
  }) => {
    await page.goto('/fee');
    await page.waitForLoadState('networkidle');

    // discountUiTargetAssignment (Student6, Sports Fee, totalAmount 1000) —
    // dedicated UI-only fixture, distinct from the API-level discount tests.
    const row = page
      .locator('table tbody tr')
      .filter({ hasText: 'Student6 Test' })
      .filter({ hasText: 'Sports Fee' });
    await row.getByRole('button', { name: 'Discount' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Apply Discount')).toBeVisible();
    // Sibling Discount: 10% of the 1000 assignment total = 100.
    await dialog
      .getByRole('combobox', { name: 'Discount' })
      .selectOption({ label: 'Sibling Discount (10%)' });
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await expect(dialog).not.toBeVisible();
    await expect(row.getByText('₹100.00')).toBeVisible({ timeout: 10_000 });
  });

  test('waiving an assignment from the Assignments tab shows a waived badge', async ({ page }) => {
    await page.goto('/fee');
    await page.waitForLoadState('networkidle');

    // waiveUiTargetAssignment (Student7, Sports Fee) — dedicated UI-only
    // fixture, distinct from the API-level waive tests.
    const row = page
      .locator('table tbody tr')
      .filter({ hasText: 'Student7 Test' })
      .filter({ hasText: 'Sports Fee' });
    await row.getByRole('button', { name: 'Waive' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Waive Fee Assignment')).toBeVisible();
    await dialog.getByRole('button', { name: 'Waive' }).click();

    await expect(dialog).not.toBeVisible();
    await expect(row.getByText('waived')).toBeVisible({ timeout: 10_000 });
  });
});
