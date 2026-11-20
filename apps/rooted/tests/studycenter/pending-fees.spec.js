import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';
import { monthAgo } from './support-money.js';

// Pending fees. Seeded: "Overdue Learner" has been on a 1500/month plan since the first
// of the month before last and paid 500 of that first cycle, so they owe 2500 overdue
// (1000 + 1500) and 1500 on the current cycle: 4000, on whatever day the seed ran.

const ROW = /Overdue Learner/;

test.describe('the owner', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('student-wise lists the learner who owes, split into overdue and current', async ({
    page,
  }) => {
    await page.goto('/fee/pending');
    await expect(page.getByRole('heading', { name: 'Pending fees' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('pending-total')).toBeVisible();
    await expect(page.getByTestId('pending-overdue')).toBeVisible();

    await page.getByLabel('Search').fill('Overdue');
    const row = page.getByTestId('pending-row').filter({ hasText: 'Overdue Learner' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('₹2,500.00'); // overdue
    await expect(row).toContainText('₹1,500.00'); // current cycle
    await expect(row).toContainText('₹4,000.00'); // pending
    await expect(row).toContainText(monthAgo(2).label); // oldest unpaid
  });

  test('a learner who owes nothing is not listed', async ({ page }) => {
    await page.goto('/fee/pending');
    await page.getByLabel('Search').fill('Member Two');
    await expect(page.getByText('No learner owes anything.')).toBeVisible({ timeout: 15_000 });
  });

  test('search also finds a learner by phone', async ({ page }) => {
    await page.goto('/fee/pending');
    await page.getByLabel('Search').fill('9000000004');
    await expect(page.getByTestId('pending-row').filter({ hasText: ROW })).toHaveCount(1, {
      timeout: 15_000,
    });
  });

  test('the learner’s name opens their billing, and the back link returns here', async ({
    page,
  }) => {
    await page.goto('/fee/pending');
    await page.getByLabel('Search').fill('Overdue');
    await page
      .getByTestId('pending-row')
      .filter({ hasText: ROW })
      .getByRole('link', { name: 'Overdue Learner' })
      .click();
    await expect(page).toHaveURL(/\/academic\/students\/[a-f0-9]+\?tab=billing/);
    await page.getByRole('link', { name: 'Back to pending fees' }).click();
    await expect(page).toHaveURL(/\/fee\/pending$/);
  });

  test('month-wise shows closed months and the running one, newest first', async ({ page }) => {
    await page.goto('/fee/pending');
    await page.getByRole('tab', { name: 'Month-wise' }).click();
    const rows = page.getByTestId('pending-month-row');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    await expect(rows.filter({ hasText: monthAgo(0).label })).toContainText('Running');
    await expect(rows.filter({ hasText: monthAgo(2).label })).toContainText('Closed');
    await expect(rows.first()).toContainText(monthAgo(0).label);
  });
});

test.describe('the front desk', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk });

  test('can see who owes, so they can collect', async ({ page }) => {
    await page.goto('/fee/pending');
    await expect(page.getByRole('heading', { name: 'Pending fees' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel('Search').fill('Overdue');
    await expect(page.getByTestId('pending-row').filter({ hasText: ROW })).toHaveCount(1);
  });
});
