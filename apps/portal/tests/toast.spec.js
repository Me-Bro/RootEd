import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

const ROW = 'enquiry-Seed Degree College, Khatima';
const select = (page) => page.getByLabel('Change status for Seed Degree College, Khatima');

test.describe('a save reports itself', () => {
  test.use({ storageState: AUTH_STATES.super_admin });

  test('success is announced politely, and can be dismissed', async ({ page }) => {
    await page.goto('/enquiries');
    await select(page).selectOption('contacted');
    const toast = page.getByTestId('toast-success');
    await expect(toast).toHaveText(/Saved/);
    await expect(toast).toHaveAttribute('role', 'status');
    await toast.getByRole('button', { name: 'Close' }).click();
    await expect(toast).toHaveCount(0);

    // Restore the seeded state every other spec expects.
    await select(page).selectOption('new');
    await expect(page.getByTestId(ROW).getByTestId('enquiry-status')).toHaveText('New');
  });

  test('a failed save shows the API message as an alert', async ({ page }) => {
    await page.route('**/admin/enquiries/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 400, json: { error: 'Nope, not allowed' } })
        : route.continue()
    );
    await page.goto('/enquiries');
    await select(page).selectOption('closed');
    const toast = page.getByTestId('toast-error');
    await expect(toast).toContainText('Nope, not allowed');
    await expect(toast).toHaveAttribute('role', 'alert');
  });
});

test.describe('loading placeholders', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('the dashboard shows a skeleton, then the figures', async ({ page }) => {
    await page.route('**/training/metrics*', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.goto('/dashboard');
    await expect(page.getByTestId('skeleton')).toBeVisible();
    await expect(page.getByTestId('enrolled-count')).toBeVisible();
    await expect(page.getByTestId('skeleton')).toHaveCount(0);
  });
});
