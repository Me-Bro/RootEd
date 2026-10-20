import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

test.describe('the public landing page', () => {
  test('anyone can read it without signing in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'From campus to career' })
    ).toBeVisible();
  });

  test('Sign in leads to the sign-in page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('Request a proposal jumps to the proposal section', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: 'Request a proposal' }).click();
    await expect(page).toHaveURL(/#request-proposal$/);
    await expect(page.getByRole('heading', { name: 'Request a proposal' })).toBeInViewport();
  });

  test('shows the contact email, and no phone line until a number is set', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'info@ruralrootcloud.com' })).toBeVisible();
    await expect(page.getByText('Phone / WhatsApp')).toHaveCount(0);
  });

  test('has a title and description for search and link previews', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Career Catalyst/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /placement/);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
  });
});

test.describe('someone already signed in does not see the landing page', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('is sent to their dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe('the app behind the landing page is still private', () => {
  test('an unsigned-in visitor asking for a page is sent to sign in, not to the landing page', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});
