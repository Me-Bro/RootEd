import { test, expect } from '@playwright/test';
import { TEST_USERS, loginViaUi } from './fixtures/auth.js';

// multi@ belongs to two colleges: Test School (librarian: no training role) and
// Second School (admin, but the training module is not switched on there).
// Someone in a single college never sees this step: auth.spec.js shows the
// trainer going straight to the dashboard.
test.describe('a person in several colleges', () => {
  test('must pick one, and each pick opens the right explanation (EH9, EH10)', async ({ page }) => {
    await loginViaUi(page, TEST_USERS.multiTenant);
    await expect(page).toHaveURL(/\/select-college$/);
    await expect(page.getByRole('heading', { name: 'Choose your college' })).toBeVisible();

    await page.getByRole('button', { name: 'Test School' }).click();
    await expect(page).toHaveURL(/\/no-access$/);
    await expect(page.getByTestId('no-access-message')).toContainText(
      'Your role in Test School does not include training and placement tracking'
    );

    await page.getByRole('link', { name: 'Switch college' }).click();
    await expect(page).toHaveURL(/\/select-college$/);
    await page.getByRole('button', { name: 'Second School' }).click();
    await expect(page).toHaveURL(/\/no-access$/);
    await expect(page.getByTestId('no-access-message')).toContainText(
      'Second School has not been set up for RR Cloud Career Catalyst yet'
    );
  });
});
