import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { AUTH_STATES } from '../fixtures/auth.js';
import { createTestApiClient } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

async function selectScope(page, { section, term }) {
  await page.locator('select').nth(0).selectOption(section._id);
  await page.locator('select').nth(1).selectOption(term._id);
}

test.describe('Report Cards page', () => {
  // Default e2e project storageState (super_admin) impersonates the seeded
  // testschool tenant and gets tenant_admin's full permission set, including
  // grades:publish — see auth.setup.js / requirePermission.js.

  test.beforeEach(async ({ page }) => {
    await page.goto('/academic/report-cards');
    await page.waitForLoadState('networkidle');
  });

  test('renders section/term controls and a Generate button for a caller with grades:publish', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Report Cards' })).toBeVisible();
    await expect(page.locator('select')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Generate Report Cards' })).toBeVisible();
  });

  test('shows seeded history rows once a section/term are selected', async ({ page }) => {
    const { section, term } = getTestIds();
    await selectScope(page, { section, term });

    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    await expect(page.locator('tbody tr')).not.toHaveCount(0, { timeout: 10_000 });
    // At least the seeded completed batch — other tests running in parallel
    // against this same section/term may add more, so don't assert an exact count.
    const completedRow = page.locator('tbody tr').filter({ hasText: 'completed' }).first();
    await expect(completedRow).toBeVisible();
    await expect(completedRow.getByRole('link', { name: 'Download' })).toBeVisible();
  });

  test('generating produces a downloadable PDF (real worker + Minio round trip)', async ({
    page,
  }) => {
    const { section, term } = getTestIds();
    await selectScope(page, { section, term });

    await page.getByRole('button', { name: 'Generate Report Cards' }).click();
    await expect(page.getByText(/Status:/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download Report Cards PDF' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test.describe('teacher (grades:publish)', () => {
    test.use({ storageState: AUTH_STATES.teacher });

    test('sees the Generate button too', async ({ page }) => {
      await page.goto('/academic/report-cards');
      await expect(page.getByRole('button', { name: 'Generate Report Cards' })).toBeVisible();
    });
  });
});

test.describe('Report card generate/status endpoints', () => {
  test('403s for a caller without grades:publish', async ({ request }) => {
    const { section, term } = getTestIds();
    const client = await createTestApiClient(request, 'viewer');
    const res = await client.post('/academic/report-card/generate', {
      sectionId: section._id,
      termId: term._id,
    });
    expect(res.status()).toBe(403);
  });

  test('403s for a caller without grades:read on status', async ({ request }) => {
    const client = await createTestApiClient(request, 'viewer');
    const res = await client.get('/academic/report-card/status/000000000000000000000000');
    expect(res.status()).toBe(403);
  });

  test('a second generate call for the same section/term reuses the first job', async ({
    request,
  }) => {
    const { section, term } = getTestIds();
    const client = await createTestApiClient(request, 'tenant_admin');

    const first = await client.post('/academic/report-card/generate', {
      sectionId: section._id,
      termId: term._id,
    });
    expect(first.ok()).toBe(true);
    const firstBody = await first.json();

    const second = await client.post('/academic/report-card/generate', {
      sectionId: section._id,
      termId: term._id,
    });
    expect(second.ok()).toBe(true);
    const secondBody = await second.json();

    expect(secondBody.jobId).toBe(firstBody.jobId);
    expect(secondBody.existing).toBe(true);
  });

  test('404s for a section that does not belong to the tenant', async ({ request }) => {
    const { term } = getTestIds();
    const client = await createTestApiClient(request, 'tenant_admin');
    const res = await client.post('/academic/report-card/generate', {
      sectionId: '000000000000000000000000',
      termId: term._id,
    });
    expect(res.status()).toBe(404);
  });

  test('history includes the seeded completed and queued batches', async ({ request }) => {
    const { section, term } = getTestIds();
    const client = await createTestApiClient(request, 'tenant_admin');
    const res = await client.get(
      `/academic/report-card/history?sectionId=${section._id}&termId=${term._id}`
    );
    expect(res.ok()).toBe(true);
    const batches = await res.json();

    const completed = batches.find((b) => b.status === 'completed' && b.url);
    const queued = batches.find((b) => b.status === 'queued');
    expect(completed).toBeTruthy();
    expect(queued).toBeTruthy();
    expect(queued.url).toBeNull();
  });
});
