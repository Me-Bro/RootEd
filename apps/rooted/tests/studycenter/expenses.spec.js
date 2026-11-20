import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// A study center records expenses on one simple page: fixed categories, no approvals.
// Seeded: rent ₹20,000 and electricity ₹3,500 this month.

test.describe('the owner', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('sees this month’s expenses and a total, with no approval tabs or budgets', async ({
    page,
  }) => {
    await page.goto('/expense');
    await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible({ timeout: 15_000 });
    const table = page.getByRole('table');
    await expect(table.getByRole('row', { name: /Rent.*₹20,000\.00/ })).toBeVisible();
    await expect(table.getByRole('row', { name: /Electricity.*₹3,500\.00/ })).toBeVisible();
    await expect(page.getByTestId('expense-total')).toContainText('₹');
    await expect(page.getByRole('button', { name: 'Pending' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Budgets' })).toHaveCount(0);
  });

  test('records an expense, edits it, and deletes it', async ({ page }) => {
    await page.goto('/expense');
    await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Add expense' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Category').selectOption('marketing');
    await dialog.getByLabel('Amount (₹)').fill('1234');
    await dialog.getByLabel('Note').fill('Flyers e2e');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Expense saved')).toBeVisible();

    const row = () => page.getByRole('table').getByRole('row', { name: /Flyers e2e/ });
    await expect(row()).toContainText('Marketing');
    await expect(row()).toContainText('₹1,234.00');

    await row().getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('dialog').getByLabel('Amount (₹)').fill('2000');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(row()).toContainText('₹2,000.00');

    page.once('dialog', (d) => d.accept());
    await row().getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Expense deleted')).toBeVisible();
    await expect(page.getByRole('table').getByText('Flyers e2e')).toHaveCount(0);
  });

  test('the form offers the fixed category list and nothing else', async ({ page }) => {
    await page.goto('/expense');
    await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Add expense' }).click();
    const options = await page
      .getByRole('dialog')
      .getByLabel('Category')
      .locator('option')
      .allTextContents();
    expect(options).toEqual([
      'Rent',
      'Electricity',
      'Internet',
      'Salary',
      'Maintenance',
      'Supplies',
      'Marketing',
      'Other',
    ]);
  });
});

test.describe('the front desk', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk });

  test('has no Expenses in the sidebar and cannot open the page', async ({ page }) => {
    await page.goto('/expense');
    await expect(page.getByText('You do not have access to this page')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Expenses' })).toHaveCount(0);
  });
});
