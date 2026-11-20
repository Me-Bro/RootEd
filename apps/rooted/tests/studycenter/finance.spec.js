import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';
import { monthAgo } from './support-money.js';

// The owner's Finance page. Seeded: rent ₹20,000 and electricity ₹3,500 on the first two
// days of this month, rent ₹20,000 on the first of last month, and one learner who owes
// ₹4,000. Other specs add payments and expenses, so totals are never asserted exactly:
// only the rows this seed controls.

test.describe('the owner', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('sees this month’s collected, spent, left over and owed, with the spending split by category', async ({
    page,
  }) => {
    await page.goto('/fee/finance');
    await expect(page.getByRole('heading', { name: 'Finance' })).toBeVisible({ timeout: 15_000 });
    for (const id of ['finance-collected', 'finance-spent', 'finance-net', 'finance-owed']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    const categories = page.getByTestId('finance-categories');
    await expect(categories.getByText('Rent')).toBeVisible();
    await expect(categories.getByText('₹20,000.00')).toBeVisible();
    await expect(categories.getByText('Electricity')).toBeVisible();
    await expect(categories.getByText('₹3,500.00')).toBeVisible();
    await expect(page.getByTestId('finance-owed')).toContainText('₹');
  });

  test('another month shows that month’s spending only', async ({ page }) => {
    await page.goto('/fee/finance');
    await expect(page.getByTestId('finance-categories').getByText('Electricity')).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel('Month').fill(monthAgo(1).key);
    const categories = page.getByTestId('finance-categories');
    await expect(categories.getByText('Electricity')).toHaveCount(0);
    await expect(categories.getByText('Rent')).toBeVisible();
    await expect(categories.getByText('₹20,000.00')).toBeVisible();
  });

  test('the six-month chart has a table view with this month and last month in it', async ({
    page,
  }) => {
    await page.goto('/fee/finance');
    await expect(page.getByTestId('money-chart')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'View as table' }).click();
    const table = page.getByRole('table');
    await expect(table.getByRole('row', { name: new RegExp(monthAgo(0).label) })).toBeVisible();
    await expect(table.getByRole('row', { name: new RegExp(monthAgo(1).label) })).toBeVisible();
    await page.getByRole('button', { name: 'View as chart' }).click();
    await expect(page.getByTestId('money-chart')).toBeVisible();
  });

  test('the owed card leads to the pending fees list', async ({ page }) => {
    await page.goto('/fee/finance');
    await page.getByTestId('finance-owed').getByRole('link').click();
    await expect(page).toHaveURL(/\/fee\/pending$/);
    await expect(page.getByRole('heading', { name: 'Pending fees' })).toBeVisible();
  });

  test('has Finance and Pending fees in the sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'Finance' }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Pending fees' }).first()).toBeVisible();
  });
});

test.describe('the front desk', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk });

  test('cannot open Finance and does not see it in the sidebar', async ({ page }) => {
    await page.goto('/fee/finance');
    await expect(page.getByText('You do not have access to this page')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Month')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Finance' })).toHaveCount(0);
  });
});
