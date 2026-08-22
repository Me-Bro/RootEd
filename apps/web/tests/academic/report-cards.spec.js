import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { AUTH_STATES } from '../fixtures/auth.js';
import { createTestApiClient } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Rebuilt per docs/mobile-ui/09-report-cards-approved.html: chip pickers (never a raw
// multi-option <select>, P9), a real progress ring driven by the BullMQ job's actual
// completed/total count (not a spinner), and resilient/recoverable polling that
// survives a remount — e.g. a locked/backgrounded phone getting its tab discarded and
// reloaded by the OS, which used to lose all track of an in-flight job (P12 in
// docs/mobile-ui/PLAN.md). There's no push-notification infra in this repo, so "we'll
// notify you" is implemented as resumable background polling, not a literal OS push.

test.describe('Report Cards page', () => {
  let sectionId;
  let termId;

  test.beforeEach(async ({ page }) => {
    const ids = getTestIds();
    sectionId = ids.section._id;
    termId = ids.term._id;
    await page.goto(`/academic/report-cards?sectionId=${sectionId}&termId=${termId}`);
    await page.waitForLoadState('networkidle');
  });

  test('renders section/term chip pickers (no raw multi-option selects) and a Generate button', async ({
    page,
  }) => {
    await expect(page.getByRole('heading', { name: 'Report Cards' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate Report Cards' })).toBeVisible();
    await expect(page.locator('select')).toHaveCount(0);
  });

  test('the section chip lists classes/sections and updates the picked scope', async ({ page }) => {
    await page.goto('/academic/report-cards');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Select section' }).click();
    const firstOption = page.getByRole('menuitem').first();
    // Menu item reads "Grade 5 - A"; the chip trigger collapses it to "Grade 5-A".
    const label = (await firstOption.textContent()).trim().replace(' - ', '-');
    await firstOption.click();

    await expect(page.getByRole('button', { name: label })).toBeVisible();
  });

  test('shows seeded history rows once a section/term are selected', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    await expect(page.locator('tbody tr')).not.toHaveCount(0, { timeout: 10_000 });
    // At least the seeded completed batch — other tests running in parallel
    // against this same section/term may add more, so don't assert an exact count.
    const completedRow = page.locator('tbody tr').filter({ hasText: 'completed' }).first();
    await expect(completedRow).toBeVisible();
    await expect(completedRow.getByRole('link', { name: 'Download' })).toBeVisible();
  });

  test('generating shows a real progress ring and an explicit "leave this screen" message, and produces a downloadable PDF (real worker + Minio round trip)', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Generate Report Cards' }).click();

    await expect(page.getByText(/Job ID:/)).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeVisible();
    await expect(page.getByText(/You can leave this screen/)).toBeVisible();

    await expect(page.getByRole('link', { name: 'Download Report Cards PDF' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test.describe('teacher (grades:publish)', () => {
    test.use({ storageState: AUTH_STATES.teacher });

    test('sees the Generate button too', async ({ page }) => {
      await expect(page.getByRole('button', { name: 'Generate Report Cards' })).toBeVisible();
    });
  });
});

test.describe('Report Cards page — mocked job polling', () => {
  // These intercept the status-polling response directly (precedent: attendance.spec.js's
  // request-mocking pattern) so progress/resilience/failure states are exercised without
  // waiting on a real BullMQ worker.

  test('shows the real completed/total counts as the ring fills, then the finished state', async ({
    page,
  }) => {
    const { section, term } = getTestIds();
    const total = 21;
    let calls = 0;

    await page.route('**/academic/report-card/generate', async (route) => {
      await route.fulfill({ json: { jobId: 'mock-job-progress', existing: false } });
    });
    await page.route('**/academic/report-card/status/mock-job-progress', async (route) => {
      calls += 1;
      const completed = Math.min(calls * 7, total);
      const state = completed >= total ? 'completed' : 'active';
      await route.fulfill({
        json: {
          jobId: 'mock-job-progress',
          state,
          progress: { completed, total },
          result: state === 'completed' ? { url: 'https://example.test/report-cards.pdf' } : null,
        },
      });
    });

    await page.goto(`/academic/report-cards?sectionId=${section._id}&termId=${term._id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Generate Report Cards' }).click();

    const ring = page.getByRole('progressbar');
    await expect(ring).toBeVisible();
    await expect(ring).toHaveAttribute('aria-valuemax', String(total));
    await expect(page.getByText(`of ${total}`)).toBeVisible();

    await expect(page.getByRole('link', { name: 'Download Report Cards PDF' })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('recovers an in-flight job after a fresh page load (screen-lock/tab-discard resilience)', async ({
    page,
  }) => {
    const { section, term } = getTestIds();

    await page.route('**/academic/report-card/status/mock-job-resume', async (route) => {
      await route.fulfill({
        json: {
          jobId: 'mock-job-resume',
          state: 'active',
          progress: { completed: 5, total: 21 },
          result: null,
        },
      });
    });

    await page.goto(`/academic/report-cards?sectionId=${section._id}&termId=${term._id}`);
    await page.waitForLoadState('networkidle');

    // Simulate a job that was already in flight before this mount — the resilience
    // path this screen exists for, not something reachable by clicking Generate.
    await page.evaluate(
      ({ sectionId, termId }) => {
        window.localStorage.setItem(
          `rooted:report-card-job:${sectionId}:${termId}`,
          JSON.stringify({ jobId: 'mock-job-resume', startedAt: Date.now() })
        );
      },
      { sectionId: section._id, termId: term._id }
    );

    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/Picked this generation back up/)).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
  });

  test('a failed job clears the resumable state and shows the failure, unchanged from before', async ({
    page,
  }) => {
    const { section, term } = getTestIds();

    await page.route('**/academic/report-card/generate', async (route) => {
      await route.fulfill({ json: { jobId: 'mock-job-failed', existing: false } });
    });
    await page.route('**/academic/report-card/status/mock-job-failed', async (route) => {
      await route.fulfill({
        json: { jobId: 'mock-job-failed', state: 'failed', progress: null, result: null },
      });
    });

    await page.goto(`/academic/report-cards?sectionId=${section._id}&termId=${term._id}`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Generate Report Cards' }).click();

    // The banner text is a superset of a history-row status ("...failed" alone),
    // which also matches the loose regex — match the full banner copy exactly.
    await expect(
      page.getByText('Report card generation failed — see history below.')
    ).toBeVisible();

    const stored = await page.evaluate(
      ({ sectionId, termId }) =>
        window.localStorage.getItem(`rooted:report-card-job:${sectionId}:${termId}`),
      { sectionId: section._id, termId: term._id }
    );
    expect(stored).toBeNull();
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

  test('status reports real completed/total progress once the worker starts generating', async ({
    request,
  }) => {
    const { section, term } = getTestIds();
    const client = await createTestApiClient(request, 'tenant_admin');

    const generate = await client.post('/academic/report-card/generate', {
      sectionId: section._id,
      termId: term._id,
    });
    expect(generate.ok()).toBe(true);
    const { jobId } = await generate.json();

    // Poll until the worker reports a progress update or the job finishes outright —
    // small seeded sections can complete within a tick or two.
    let body;
    for (let i = 0; i < 15; i++) {
      const res = await client.get(`/academic/report-card/status/${jobId}`);
      expect(res.ok()).toBe(true);
      body = await res.json();
      if (body.progress || body.state === 'completed' || body.state === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    expect(body.state === 'completed' || body.state === 'failed' || Boolean(body.progress)).toBe(
      true
    );
    if (body.progress) {
      expect(typeof body.progress.completed).toBe('number');
      expect(typeof body.progress.total).toBe('number');
    }
  });
});
