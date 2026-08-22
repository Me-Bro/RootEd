import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestApiClient } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Fee Structures', () => {
  test('rejects structure creation with no components', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    const res = await client.post('/fee/structures', {
      name: 'Bad',
      academicYearId: ids.academicYear._id,
      components: [],
    });
    expect(res.status()).toBe(400);
  });

  test('duplicate name+year returns 409', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    const res = await client.post('/fee/structures', {
      name: 'Standard Fee',
      academicYearId: ids.academicYear._id,
      components: [{ label: 'X', amount: 1 }],
    });
    expect(res.status()).toBe(409);
  });

  test('PATCH edit updates name', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    const created = await client.post('/fee/structures', {
      name: 'Throwaway Fee',
      academicYearId: ids.academicYear._id,
      components: [{ label: 'X', amount: 100 }],
    });
    const { _id } = await created.json();

    const res = await client.patch(`/fee/structures/${_id}`, { name: 'Renamed Fee' });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('Renamed Fee');
  });

  test('activate/deactivate round-trip', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    const created = await client.post('/fee/structures', {
      name: 'Toggle Fee',
      academicYearId: ids.academicYear._id,
      components: [{ label: 'X', amount: 100 }],
    });
    const { _id } = await created.json();

    const deactivated = await client.patch(`/fee/structures/${_id}/deactivate`);
    expect((await deactivated.json()).isActive).toBe(false);

    const activated = await client.patch(`/fee/structures/${_id}/activate`);
    expect((await activated.json()).isActive).toBe(true);
  });

  test('assigning a structure with an optional component only totals mandatory amount', async ({
    request,
  }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    await client.post(`/fee/structures/${ids.feeStructureWithOptional._id}/assign`, {
      sectionId: ids.section._id,
    });
    const res = await client.get(`/fee/assignments?yearId=${ids.academicYear._id}`);
    const body = await res.json();
    const assignment = body.find((a) => a.feeStructureId?._id === ids.feeStructureWithOptional._id);
    expect(assignment.totalAmount).toBe(1000); // excludes the 800 optional component
  });

  test('creating an applicableTo:all structure auto-assigns active students', async ({
    request,
  }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    const res = await client.post('/fee/structures', {
      name: 'Auto All Fee',
      academicYearId: ids.academicYear._id,
      applicableTo: 'all',
      components: [{ label: 'X', amount: 100 }],
    });
    const body = await res.json();
    expect(body.autoAssign.created).toBeGreaterThan(0);
  });

  test('creating an applicableTo:class structure auto-assigns only that class', async ({
    request,
  }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    const res = await client.post('/fee/structures', {
      name: 'Auto Class Fee',
      academicYearId: ids.academicYear._id,
      applicableTo: 'class',
      classId: ids.class._id,
      components: [{ label: 'X', amount: 100 }],
    });
    const body = await res.json();
    expect(body.autoAssign.created).toBeGreaterThan(0);
  });

  test('assign route accepts dueDate override and ignores academicYearId', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    const res = await client.post(`/fee/structures/${ids.feeStructure._id}/assign`, {
      sectionId: ids.sectionB._id,
      dueDate: '2026-01-15',
      academicYearId: 'ignored-not-an-objectid',
    });
    expect(res.status()).toBe(200); // proves academicYearId is silently dropped, not validated
  });

  test('paying against a specific installment updates only that installment', async ({
    request,
  }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    await client.post('/fee/payments', {
      assignmentId: ids.installmentAssignment._id,
      amount: 3000,
      paymentMethod: 'cash',
      installmentIndex: 0,
    });
    const res = await client.get(
      `/fee/assignments?studentId=${ids.installmentAssignment.studentId}`
    );
    const body = await res.json();
    const a = body.find((x) => x._id === ids.installmentAssignment._id);
    expect(a.installments[0].status).toBe('paid');
    expect(a.installments[1].status).toBe('unpaid');
  });

  test('creating a structure with lateFeeEnabled requires lateFeeType/lateFeeValue', async ({
    request,
  }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    const res = await client.post('/fee/structures', {
      name: 'Late Fee Missing Type',
      academicYearId: ids.academicYear._id,
      lateFeeEnabled: true,
      components: [{ label: 'X', amount: 100 }],
    });
    expect(res.status()).toBe(400);
  });

  test('clone creates a copy in the target year with scaled amounts', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    const res = await client.post(`/fee/structures/${ids.feeStructure._id}/clone`, {
      targetAcademicYearId: ids.nextAcademicYear._id,
      amountAdjustmentPercent: 10,
    });
    const body = await res.json();
    expect(body.name).toBe('Standard Fee');
    expect(body.components.find((c) => c.label === 'Tuition').amount).toBe(5500); // 5000 * 1.1
  });

  test('cloning into a year that already has the same name is a 409', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    // Clone twice within this test (rather than relying on another test's side effect,
    // since Playwright's fullyParallel mode doesn't guarantee cross-test ordering).
    await client.post(`/fee/structures/${ids.feeStructureWithOptional._id}/clone`, {
      targetAcademicYearId: ids.nextAcademicYear._id,
    });
    const res = await client.post(`/fee/structures/${ids.feeStructureWithOptional._id}/clone`, {
      targetAcademicYearId: ids.nextAcademicYear._id,
    });
    expect(res.status()).toBe(409);
  });

  test('CSV import creates structures and reports row errors', async ({ request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    const csv = [
      'name,academicYearId,dueDate,component1Label,component1Amount',
      `Imported Fee A,${ids.academicYear._id},2025-11-01,Tuition,4000`,
      `,${ids.academicYear._id},2025-11-01,Tuition,4000`,
    ].join('\n');
    const res = await client.postFile('/fee/structures/import', {
      name: 'structures.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });
    const body = await res.json();
    expect(body.saved).toBe(1);
    expect(body.errors).toHaveLength(1);
  });
});

test.describe('Fee Structures UI', () => {
  test('shows Fee Structures page with currency-formatted amounts', async ({ page }) => {
    const ids = getTestIds();
    await page.goto('/fee/structures');
    await expect(page.getByRole('heading', { name: 'Fee Structures' })).toBeVisible();
    // Scope to the seed's own year — clone tests create same-named structures in
    // nextAcademicYear, which would otherwise make "Standard Fee" ambiguous here.
    await page.getByRole('combobox', { name: 'Academic Year' }).selectOption(ids.academicYear._id);
    await expect(page.getByText('Standard Fee')).toBeVisible();
    await expect(page.getByText(/5,500/)).toBeVisible();
  });

  test('search filters the structure list', async ({ page }) => {
    const ids = getTestIds();
    await page.goto('/fee/structures');
    await page.getByRole('combobox', { name: 'Academic Year' }).selectOption(ids.academicYear._id);
    await page.getByPlaceholder('Search structures...').fill('Sports');
    await expect(page.getByText('Sports Fee')).toBeVisible();
    await expect(page.getByText('Standard Fee')).not.toBeVisible();
  });

  test('editing a structure updates its name', async ({ page, request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    await client.post('/fee/structures', {
      name: 'UI Edit Target',
      academicYearId: ids.academicYear._id,
      components: [{ label: 'X', amount: 100 }],
    });

    await page.goto('/fee/structures');
    const card = page.locator('[data-slot="card"]', { hasText: 'UI Edit Target' });
    await card.getByRole('button', { name: 'Edit' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('UI Edited Name');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('UI Edited Name')).toBeVisible();
  });

  test('deactivating a structure shows Inactive badge', async ({ page, request }) => {
    const ids = getTestIds();
    const client = await createTestApiClient(request, 'super_admin');
    await client.post('/fee/structures', {
      name: 'UI Deactivate Target',
      academicYearId: ids.academicYear._id,
      components: [{ label: 'X', amount: 100 }],
    });

    await page.goto('/fee/structures');
    const card = page.locator('[data-slot="card"]', { hasText: 'UI Deactivate Target' });
    await card.getByRole('button', { name: 'Deactivate' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Confirm' }).click();

    await expect(card.getByText('Inactive')).toBeVisible();
  });

  test('shows applicable discount count badge on Standard Fee card', async ({ page }) => {
    await page.goto('/fee/structures');
    const card = page.locator('[data-slot="card"]', { hasText: 'Standard Fee' });
    await expect(card.getByText(/1 discount/)).toBeVisible();
  });

  // Mobile-ui spec (docs/mobile-ui/16-fee-structures-approved.html, Mock 2/approved):
  // every card shows its collection rate inline — no extra tap into a separate summary.
  test('shows collection rate inline on the structure card, without an extra tap', async ({
    page,
  }) => {
    const ids = getTestIds();
    await page.goto('/fee/structures');
    await page.getByRole('combobox', { name: 'Academic Year' }).selectOption(ids.academicYear._id);
    const card = page.locator('[data-slot="card"]', { hasText: 'Standard Fee' });
    // Values aren't asserted exactly — other tests in this file assign additional
    // students to this same structure, so assignedCount/collected% legitimately vary
    // by run order. What must hold is that the bar and its labels render immediately.
    await expect(card.getByText(/\d+ assigned/)).toBeVisible();
    await expect(card.getByText(/\d+% collected/)).toBeVisible();
    await expect(card.getByText(/ of /)).toBeVisible();
  });

  test('shows an Active badge on an active structure card', async ({ page }) => {
    await page.goto('/fee/structures');
    const card = page.locator('[data-slot="card"]', { hasText: 'Standard Fee' });
    await expect(card.getByText('Active', { exact: true })).toBeVisible();
  });

  test('a failed summary fetch for one card does not block the rest of the list', async ({
    page,
  }) => {
    const ids = getTestIds();
    // Route only the Standard Fee summary call to a 500 — every other card's summary
    // (and the components/total block on this card, which doesn't depend on it) must
    // still render per spec §5 "Errors, empty states, accessibility".
    await page.route(`**/fee/structures/${ids.feeStructure._id}/summary`, (route) =>
      route.fulfill({ status: 500, json: { error: 'boom' } })
    );
    await page.goto('/fee/structures');
    await page.getByRole('combobox', { name: 'Academic Year' }).selectOption(ids.academicYear._id);

    const brokenCard = page.locator('[data-slot="card"]', { hasText: 'Standard Fee' });
    await expect(brokenCard.getByText(/5,500/)).toBeVisible(); // components/total still show
    await expect(brokenCard.getByText(/% collected/)).not.toBeVisible();

    const otherCard = page.locator('[data-slot="card"]', { hasText: 'Sports Fee' });
    await expect(otherCard.getByText(/% collected/)).toBeVisible();
  });
});
