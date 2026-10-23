// Students mostly use the portal on a phone. This runs only in the `mobile`
// project (Pixel 7 viewport): nothing may force the page to scroll sideways, and
// the page's own content must be reachable.
import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

// Also proves the phone viewport is really in force: a desktop-sized page would pass trivially.
const noSidewaysScroll = (page) =>
  page.evaluate(
    () => window.innerWidth < 500 && document.documentElement.scrollWidth <= window.innerWidth
  );

test.describe('student pages on a phone', () => {
  test.use({ storageState: AUTH_STATES.student });

  for (const [path, heading] of [
    ['/me/progress', 'My progress'],
    ['/me/roadmap', 'My roadmap'],
    ['/me/leaderboard', 'Batch leaderboard'],
  ]) {
    test(`${path} fits the screen`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      expect(await noSidewaysScroll(page)).toBe(true);
    });
  }

  test('the navigation scrolls inside itself and reaches the last link', async ({ page }) => {
    await page.goto('/me/progress');
    const last = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    expect(await noSidewaysScroll(page)).toBe(true);
  });
});

test.describe('public pages on a phone', () => {
  test('the landing page fits the screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
  });

  test('the sign-in page fits the screen', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
  });
});
