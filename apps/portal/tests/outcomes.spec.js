import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

test.describe('platform admin sees outcomes across colleges', () => {
  test.use({ storageState: AUTH_STATES.super_admin });

  test('lists each college with its figures', async ({ page }) => {
    await page.goto('/outcomes');
    await expect(page.getByRole('heading', { level: 1, name: 'Outcomes' })).toBeVisible();
    const row = page.getByTestId('outcome-Test School');
    await expect(row).toBeVisible();
    // The seeded batch: 2 completed; 1 student joined an employer.
    const cells = await row.getByRole('cell').allInnerTexts();
    expect(cells[2]).toBe('2'); // Completed
    expect(cells[9]).toBe('1'); // Joined
    await expect(page.getByTestId('total-colleges')).toBeVisible();
  });

  test('shows no one by name: counts and percentages only (V7)', async ({ page }) => {
    await page.goto('/outcomes');
    await expect(page.getByTestId('outcome-Test School')).toBeVisible();
    // "Test School" is a college name, so look at the page without it.
    const text = (await page.locator('main').innerText()).replaceAll('Test School', '');
    for (const personal of ['Student', '2025-TEST', 'Seed: Acme']) {
      expect(text).not.toContain(personal);
    }
  });

  test('has no college navigation: only the platform pages', async ({ page }) => {
    await page.goto('/outcomes');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(nav.getByRole('link', { name: 'Outcomes' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Enquiries' })).toBeVisible();
  });
});

test.describe('a college administrator cannot see other colleges', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('is sent back to their own dashboard', async ({ page }) => {
    await page.goto('/outcomes');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('is refused by the API too', async ({ request }) => {
    const refresh = await request.post('/__api/auth/refresh');
    const { accessToken } = await refresh.json();
    const res = await request.get('/__api/admin/training/outcomes', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status()).toBe(403);
  });
});
