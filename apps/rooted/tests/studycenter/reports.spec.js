import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// Phase 5 of TICKET-007: the owner's four reports. Seeded: member1 has two closed
// visits early this month (60 and 90 minutes, on seat A-1); a walk-in has two day
// passes, one sold yesterday and one today; nobody is inside.

test.describe('reports', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('shows seats right now, held by members, and the day-pass pool', async ({ page }) => {
    await page.goto('/academic/study-center-reports');
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('stat-inside')).toContainText('/');
    await expect(page.getByTestId('stat-held')).toBeVisible();
    await expect(page.getByTestId('stat-pool')).toContainText('/');
    await expect(page.getByRole('row', { name: /Morning/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /Evening/ })).toBeVisible();
  });

  test('lists time on seat per learner for the month', async ({ page }) => {
    await page.goto('/academic/study-center-reports');
    const row = page.getByRole('row', { name: /Member One Study/ });
    await expect(row).toBeVisible({ timeout: 15_000 });
    // 60 + 90 minutes seeded, plus anything the front-desk specs added.
    await expect(row).toContainText(/\d+ h|\d+ min/);
  });

  test('lists members whose paid plan covered the day and who did not come in', async ({
    page,
  }) => {
    await page.goto('/academic/study-center-reports');
    await expect(page.getByText('Did not come in')).toBeVisible({ timeout: 15_000 });
    // Member One has a paid plan covering today and the seed has no visit today.
    // (A front-desk spec may have checked them in; then the list is empty, which the
    // page says in words, so accept either.)
    // Scoped to this report: Member One also appears in the hours table above.
    const section = page.locator('section[aria-labelledby="rep-noshows"]');
    const none = section.getByText('Everyone with a plan came in.');
    const row = section.getByRole('row', { name: /Member One Study/ });
    await expect(none.or(row)).toBeVisible();
  });

  test('shows day pass sales per day with a total', async ({ page }) => {
    await page.goto('/academic/study-center-reports');
    await expect(page.getByTestId('sales-total')).toContainText(/\d+ passes, /, {
      timeout: 15_000,
    });
  });
});

test.describe('the front desk', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk });

  test('may read the visit reports, and sees the sales too (the desk holds fees:read)', async ({
    page,
  }) => {
    await page.goto('/academic/study-center-reports');
    await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Day pass sales' })).toBeVisible();
  });
});

test.describe('a member', () => {
  test.use({ storageState: STUDY_AUTH_STATES.member1 });

  test('cannot open the reports', async ({ page }) => {
    await page.goto('/academic/study-center-reports');
    await expect(page.getByRole('heading', { name: 'Reports' })).toHaveCount(0);
  });

  test('sees this month’s visits, time on seat and the centre’s hours on their own page', async ({
    page,
  }) => {
    await page.goto('/me/seat');
    const visits = page.getByTestId('my-visits');
    await expect(visits).toBeVisible({ timeout: 15_000 });
    await expect(visits).toContainText(/This month: \d+ visits?/);
    await expect(page.getByTestId('my-open-hours')).toContainText('Open 06:00 to 22:00');
  });
});
