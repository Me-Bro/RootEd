import { test } from '@playwright/test';
import { checkA11y, injectAxe } from 'axe-playwright';
import { openLoginDialog } from './fixtures/auth.js';

const A11Y_OPTIONS = {
  detailedReport: true,
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
};

// /login renders the landing page UI with sign-in in a dialog, so both
// states need auditing: the page as loaded, and the dialog that holds the
// actual form.
test('login page has no critical accessibility violations', async ({ page }) => {
  await page.goto('/login');
  await injectAxe(page);
  await checkA11y(page, null, A11Y_OPTIONS);
});

test('login dialog has no critical accessibility violations', async ({ page }) => {
  await page.goto('/login');
  await openLoginDialog(page);
  await injectAxe(page);
  await checkA11y(page, null, A11Y_OPTIONS);
});
