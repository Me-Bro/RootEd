import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// The learner's own seat page and home card (TICKET-007 phase 2). Seeded: member1
// holds A-1 (Hall 1) in the Morning and B-4 (Hall 2) in the Evening; member2 holds none.

test.describe('a member with seats', () => {
  test.use({ storageState: STUDY_AUTH_STATES.member1 });

  test('the home page leads with the seat card and has no grades or timetable', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    const card = page.getByTestId('study-seat-card');
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('Morning');
    await expect(card).toContainText('Seat A-1');
    await expect(card).toContainText('Evening');
    await expect(card).toContainText('Seat B-4');

    await expect(page.getByText('Latest grades')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'View timetable' })).toHaveCount(0);
  });

  test('/me/seat lists each shift with its hours, seat and zone', async ({ page }) => {
    await page.goto('/me/seat');
    await expect(page.getByRole('heading', { name: 'My seat' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('06:00–14:00')).toBeVisible();
    await expect(page.getByText('Seat A-1')).toBeVisible();
    await expect(page.getByText('Hall 1')).toBeVisible();
    await expect(page.getByText('14:00–22:00')).toBeVisible();
    await expect(page.getByText('Seat B-4')).toBeVisible();
  });

  test('the sidebar offers My seat but not My grades or My timetable', async ({ page }) => {
    await page.goto('/dashboard');
    const links = page.getByRole('link');
    await expect(links.filter({ hasText: /^My seat$/ }).first()).toBeVisible({ timeout: 15_000 });
    for (const gone of ['My Grades', 'My Timetable']) {
      await expect(links.filter({ hasText: new RegExp(`^${gone}$`) })).toHaveCount(0);
    }
  });
});

test.describe('a member with no seat yet', () => {
  test.use({ storageState: STUDY_AUTH_STATES.member2 });

  test('is told to ask the front desk, not shown an error', async ({ page }) => {
    await page.goto('/me/seat');
    await expect(page.getByText('No seat yet. Ask the front desk.').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});
