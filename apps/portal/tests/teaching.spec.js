import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

const row = (page, code) => page.getByTestId(`teaching-row-${code}`);

test.describe('administrator assigns teachers to modules', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('assigns a teacher, then removes them', async ({ page }) => {
    await page.goto('/teaching');
    const select = page.getByLabel('Teacher for Science');
    await expect(row(page, 'SCI5')).toBeVisible();
    await expect(select).toHaveValue('');

    await select.selectOption({ label: 'teacher@testschool.local' });
    await expect(select).not.toHaveValue('');

    // the choice is stored, not just held in the page
    await page.reload();
    await expect(page.getByLabel('Teacher for Science')).not.toHaveValue('');

    await page.getByLabel('Teacher for Science').selectOption({ label: 'Not assigned' });
    await page.reload();
    await expect(page.getByLabel('Teacher for Science')).toHaveValue('');
  });
});

test.describe('a trainer cannot open Teaching', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('has no tab and is sent back from the URL', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'Teaching' })).toHaveCount(0);
    await page.goto('/teaching');
    await expect(page).not.toHaveURL(/\/teaching/);
  });
});
