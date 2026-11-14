import { test, expect } from '@playwright/test';

const PLAY_HREF = 'https://play.google.com/store/apps/details?id=com.ruralrootcloud.rooted';
const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

// The Play badge, QR code and Android band are Rural Root Cloud's — the test
// host is not a Rana Brothers host, so brand.playStoreUrl is set (lib/brand.js).
test.describe('Landing page — Android app (desktop)', () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: DESKTOP });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('every Play badge opens the Play listing safely in a new tab', async ({ page }) => {
    const badges = page.locator('a.play:visible');
    expect(await badges.count()).toBeGreaterThanOrEqual(3); // hero, Android band, CTA band
    for (const badge of await badges.all()) {
      await expect(badge).toHaveAttribute(
        'href',
        expect.stringContaining(`${PLAY_HREF}&referrer=`)
      );
      await expect(badge).toHaveAttribute('target', '_blank');
      await expect(badge).toHaveAttribute('rel', /noopener/);
      await expect(badge).toHaveAccessibleName('Get it on Google Play');
    }
  });

  test('the QR code loads, is labelled, and points at the app', async ({ page }) => {
    const qr = page.getByRole('img', { name: 'Scan to get RootEd on Google Play' });
    await qr.scrollIntoViewIfNeeded();
    await expect(qr).toBeVisible();
    // naturalWidth > 0 proves the SVG actually loaded, not just that <img> exists.
    expect(await qr.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test('role tabs switch the panel', async ({ page }) => {
    const panel = page.getByRole('tabpanel');
    await expect(panel).toContainText('Check the whole school before first period');
    await page.getByRole('tab', { name: 'Teacher' }).click();
    await expect(panel).toContainText('Mark a class in under a minute');
    await expect(page.getByRole('tab', { name: 'Teacher' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await page.getByRole('tab', { name: 'Teacher' }).press('ArrowRight');
    await expect(panel).toContainText('Know what is collected and what is overdue');
  });

  test('FAQ answers expand', async ({ page }) => {
    const q = page.getByText('Is there a mobile app?', { exact: true });
    await q.scrollIntoViewIfNeeded();
    await q.click();
    await expect(
      page.getByText('an Android app is on Google Play', { exact: false })
    ).toBeVisible();
  });
});

test.describe('Landing page — Android app (mobile)', () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: MOBILE });

  test('Android visitors get Play as the primary action, sticky bar included', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      viewport: MOBILE,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
    });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('.m-hero a.play')).toBeVisible();
    await expect(page.locator('.m-sticky-cta a.play')).toBeVisible();
    await ctx.close();
  });

  test('other visitors keep "Get started" as the primary action', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.m-hero a.play')).toHaveCount(0);
    await expect(
      page.locator('.m-sticky-cta').getByRole('button', { name: 'Get started free' })
    ).toBeVisible();
  });
});
