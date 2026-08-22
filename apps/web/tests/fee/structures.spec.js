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
});
