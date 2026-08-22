import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { AUTH_STATES } from '../fixtures/auth.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Rebuilt per docs/mobile-ui/10-academic-years-approved.html: terms are now
// shown inline on the year card (closing P14 — Terms previously had no UI at
// all), the active year's terms are always expanded, and every write control
// (New Year / Set active / Add a term) is admin-only.
//
// Tests never actually confirm "Set active" against the seeded 2025-26/2026-27
// years — that would flip which year every *other* spec file's fixtures
// assume is active. The confirm-dialog copy is asserted, then cancelled.

test.describe('Academic Years page', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test.beforeEach(async ({ page }) => {
    await page.goto('/academic/years');
    await page.waitForLoadState('networkidle');
  });

  test('active year is expanded by default, showing its seeded term', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Academic Years' })).toBeVisible();
    await expect(page.getByText('2025-26', { exact: true })).toBeVisible();
    await expect(page.getByText('● Active')).toBeVisible();
    await expect(page.getByText('Term 1', { exact: true })).toBeVisible();
  });

  test('inactive year starts collapsed and expands in place on tap', async ({ page }) => {
    const nextCard = page.locator('[data-slot="card"]').filter({ hasText: '2026-27' });
    const toggle = nextCard.getByRole('button', { name: /\d+ terms?/ });

    // "+ Add a term" only renders in the expanded body, so its presence is a
    // direction-agnostic signal that the card body actually opened — this
    // holds whether or not a term was left behind in 2026-27 by another run.
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(nextCard.getByRole('button', { name: '+ Add a term' })).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(nextCard.getByRole('button', { name: '+ Add a term' })).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(nextCard.getByRole('button', { name: '+ Add a term' })).toHaveCount(0);
  });

  test('adding a term that overlaps the seeded term warns but does not block typing', async ({
    page,
  }) => {
    const activeCard = page.locator('[data-slot="card"]').filter({ hasText: '2025-26' });
    await activeCard.getByRole('button', { name: '+ Add a term' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Name').fill('Overlap Check');
    await page.getByLabel('Start Date').fill('2025-05-01');
    await page.getByLabel('End Date').fill('2025-06-01');

    await expect(page.getByText(/Overlaps Term 1/)).toBeVisible();

    // Advisory only — never submitted, so the seeded fixtures stay untouched.
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('adding a non-overlapping term to the empty year succeeds', async ({ page }) => {
    const termName = `E2E Term ${Date.now()}`;
    const nextCard = page.locator('[data-slot="card"]').filter({ hasText: '2026-27' });
    await nextCard.getByRole('button', { name: /\d+ terms?/ }).click();

    await nextCard.getByRole('button', { name: '+ Add a term' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByLabel('Name').fill(termName);
    await page.getByLabel('Start Date').fill('2026-04-01');
    await page.getByLabel('End Date').fill('2026-09-30');
    await page.getByRole('button', { name: 'Add Term' }).click();

    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(termName)).toBeVisible();
  });

  test('Set active always confirms first and explains the app-wide effect, then can be cancelled', async ({
    page,
  }) => {
    const { nextAcademicYear } = getTestIds();
    await page.getByRole('button', { name: 'Set active' }).click();

    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText(new RegExp(`${nextAcademicYear.name}.*active year`))).toBeVisible();
    await expect(page.getByText(/switches to this year as its default/)).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    // Nothing was activated — the seeded active year is still marked so.
    await expect(page.getByText('● Active')).toBeVisible();
  });

  test('New Year dialog states the new year becomes active immediately', async ({ page }) => {
    await page.getByRole('button', { name: 'New Year' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText(/becomes active immediately/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });
});

test.describe('Academic Years page (read-only)', () => {
  // 'viewer' only has inventory:read in the seed data (no students:read at all,
  // so it can't reach this page) — 'teacher' has students:read but not
  // tenant:admin, which is what this test actually needs to exercise.
  test.use({ storageState: AUTH_STATES.teacher });

  test('write controls are absent, not disabled, for a user without tenant:admin', async ({
    page,
  }) => {
    await page.goto('/academic/years');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('2025-26', { exact: true })).toBeVisible();
    await expect(page.getByText('Term 1', { exact: true })).toBeVisible();

    await expect(page.getByRole('button', { name: 'New Year' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Set active' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Add a term' })).toHaveCount(0);
  });
});
