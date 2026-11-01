import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// Phase 1 of TICKET-007: the study-center tenant is reachable, its nav leaves out
// what a seat business has no use for, and the owner (only) can set the centre's
// opening hours and discount policy.

test.describe('study center owner', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('the sidebar has no timetable, grades or report cards, but has centre settings', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    const links = page.getByRole('link');
    await expect(links.filter({ hasText: /^Centre settings$/ }).first()).toBeVisible({
      timeout: 15_000,
    });
    for (const gone of ['Timetable', 'Grades', 'Grade Report', 'Report Cards']) {
      await expect(links.filter({ hasText: new RegExp(`^${gone}$`) })).toHaveCount(0);
    }
    // Learners keep their usual name for people in a batch org.
    await expect(links.filter({ hasText: /^Learner$/ }).first()).toBeVisible();
  });

  test('saves opening hours and the discount policy, and they survive a reload', async ({
    page,
  }) => {
    await page.goto('/tenant/centre');
    await expect(page.getByRole('heading', { name: 'Centre settings' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel('Opens at').fill('07:00');
    await page.getByLabel('Closes at').fill('21:30');
    await page.getByRole('radio', { name: /The front desk too/ }).check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toContainText('Settings saved');

    await page.reload();
    await expect(page.getByLabel('Opens at')).toHaveValue('07:00');
    await expect(page.getByLabel('Closes at')).toHaveValue('21:30');
    await expect(page.getByRole('radio', { name: /The front desk too/ })).toBeChecked();

    // Put the defaults back so other specs see the seeded state.
    await page.getByLabel('Opens at').fill('06:00');
    await page.getByLabel('Closes at').fill('22:00');
    await page.getByRole('radio', { name: /Only the owner/ }).check();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('status')).toContainText('Settings saved');
  });

  test('a closing time before the opening time is refused with a message', async ({ page }) => {
    await page.goto('/tenant/centre');
    await page.getByLabel('Opens at').fill('20:00');
    await page.getByLabel('Closes at').fill('08:00');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText(/later than opening/i);
  });
});

test.describe('study center front desk', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk });

  test('has no centre settings entry and cannot open the page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link').filter({ hasText: /^Centre settings$/ })).toHaveCount(0);

    await page.goto('/tenant/centre');
    await expect(page.getByRole('heading', { name: 'Centre settings' })).toHaveCount(0);
  });
});
