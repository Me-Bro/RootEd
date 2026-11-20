import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// The seeded study center has no org profile on purpose: it exercises the empty
// state for the owner (who gets the form) and for a member (who gets a notice).

test.describe('Org profile, empty (owner)', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('shows the code and an empty form to fill in', async ({ page }) => {
    await page.goto('/tenant/profile');
    await expect(page.getByTestId('org-code')).toHaveText('STUD-YCT2');
    await expect(page.getByLabel('Phone')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible();
  });
});

test.describe('Org profile, empty (desk staff)', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk });

  test('explains that nothing has been added yet', async ({ page }) => {
    await page.goto('/tenant/profile');
    await expect(page.getByTestId('org-code')).toHaveText('STUD-YCT2');
    await expect(page.getByText('has not added its profile yet')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save profile' })).toHaveCount(0);
  });
});
