import { test, expect } from '@playwright/test';
import { TEST_USERS, loginViaUi } from './fixtures/auth.js';

test.describe('signed in with nothing to open (EH10)', () => {
  test('explains why, never a blank page, and offers sign-out', async ({ page }) => {
    // viewer@ is the college librarian: a member of Test School with no training role.
    await loginViaUi(page, TEST_USERS.viewer);
    await expect(page).toHaveURL(/\/no-access$/);
    await expect(page.getByRole('heading', { name: 'Nothing to open yet' })).toBeVisible();
    await expect(page.getByTestId('no-access-message')).toContainText('Test School');

    // Asking for any page just brings them back here instead of looping or going blank.
    await page.goto('/assignments');
    await expect(page).toHaveURL(/\/no-access$/);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
