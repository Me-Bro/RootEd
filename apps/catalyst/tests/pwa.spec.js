import { test, expect } from '@playwright/test';

test.describe('installable app', () => {
  test('links a manifest whose icons exist', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await request.get(href)).json();

    expect(manifest).toMatchObject({ start_url: '/', display: 'standalone' });
    expect(manifest.name).toBeTruthy();
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const res = await request.get(icon.src);
      expect(res.ok(), icon.src).toBe(true);
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('the service worker never caches API calls', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.ok()).toBe(true);
    const source = await res.text();
    // The one rule that keeps personal data out of the cache.
    expect(source).toContain("startsWith('/__api/')");
  });
});
