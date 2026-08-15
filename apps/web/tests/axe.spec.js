import { test } from '@playwright/test';
import { checkA11y, injectAxe } from 'axe-playwright';

test('login page has no critical accessibility violations', async ({ page }) => {
  await page.goto('/login');
  await injectAxe(page);
  await checkA11y(page, null, {
    detailedReport: true,
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  });
});
