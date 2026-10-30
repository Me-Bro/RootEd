import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

const NEW_ROW = 'enquiry-Seed Degree College, Khatima';
const CONTACTED_ROW = 'enquiry-Seed Polytechnic, Rudrapur';

test.describe('platform admin reviews enquiries', () => {
  test.use({ storageState: AUTH_STATES.super_admin });

  test('lists the seeded enquiries with their contact details', async ({ page }) => {
    await page.goto('/enquiries');
    await expect(page.getByRole('heading', { level: 1, name: 'Enquiries' })).toBeVisible();
    const row = page.getByTestId(NEW_ROW);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Seed Enquirer One');
    await expect(row.getByRole('link', { name: '+919876500001' })).toHaveAttribute(
      'href',
      'tel:+919876500001'
    );
    await expect(row.getByTestId('enquiry-status')).toHaveText('New');
    await expect(page.getByTestId(CONTACTED_ROW).getByTestId('enquiry-status')).toHaveText(
      'Contacted'
    );
  });

  test('filters by status', async ({ page }) => {
    await page.goto('/enquiries');
    await page.getByLabel('Show').selectOption('contacted');
    await expect(page.getByTestId(CONTACTED_ROW)).toBeVisible();
    await expect(page.getByTestId(NEW_ROW)).toHaveCount(0);
  });

  test('moves an enquiry to another status', async ({ page }) => {
    await page.goto('/enquiries');
    const select = page.getByLabel('Change status for Seed Degree College, Khatima');
    await select.selectOption('contacted');
    await expect(page.getByTestId(NEW_ROW).getByTestId('enquiry-status')).toHaveText('Contacted');
    // Put it back so the seeded state is what every later spec expects.
    await select.selectOption('new');
    await expect(page.getByTestId(NEW_ROW).getByTestId('enquiry-status')).toHaveText('New');
  });
});

test.describe('nobody else can read enquiries', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('a college administrator is sent to their own dashboard', async ({ page }) => {
    await page.goto('/enquiries');
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('and the API refuses them too', async ({ request }) => {
    const refresh = await request.post('/__api/auth/refresh');
    const { accessToken } = await refresh.json();
    const res = await request.get('/__api/admin/enquiries', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status()).toBe(403);
  });
});
