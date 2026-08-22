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
});
