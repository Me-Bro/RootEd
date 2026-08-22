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
});
