import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

test.describe('a page that crashes', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('shows the fallback, keeps the nav, and recovers on another page', async ({ page }) => {
    // Metrics without the expected shape make the dashboard throw while rendering.
    await page.route('**/training/metrics*', (route) =>
      route.fulfill({ json: { metrics: { enrolled: 1, active: 1 } } })
    );

    await page.goto('/dashboard');
    await expect(page.getByTestId('crash-fallback')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Assignments' })).toBeVisible();

    await page.getByRole('link', { name: 'Assignments' }).click();
    await expect(page).toHaveURL(/\/assignments/);
    await expect(page.getByTestId('crash-fallback')).toBeHidden();
  });
});
