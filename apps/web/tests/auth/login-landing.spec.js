/**
 * `/login` renders the approved landing page UI
 * (apps/web/src/components/marketing/LandingView.jsx) with sign-in in a
 * dialog — see pages/auth/LoginPage.jsx. The behaviors this guards:
 * `/login` shows the landing UI rather than a bare form, both the desktop
 * and mobile layouts render at their breakpoints, and login still works
 * end-to-end through the dialog.
 *
 * Form-level login cases (valid/invalid credentials, validation) live in
 * tests/auth/login.spec.js; this file covers the landing UI itself and the
 * dialog's open/close behavior.
 */
import { test, expect } from '@playwright/test';
import { AUTH_STATES, TEST_USERS, openLoginDialog } from '../fixtures/auth.js';
import {
  trackConsoleErrors,
  assertNoErrors,
  assertNoHorizontalOverflow,
} from '../support/pageAudit.js';

// Deliberately hardcoded rather than imported from landingContent.js: this
// pins the product decision (PLAN.md, "Not in this batch" — no signup page
// exists, so the CTA opens the real contact channel). Importing the constant
// would make the assertion tautological.
const TRIAL_HREF = 'mailto:ruralrootcloud@gmail.com?subject=RootEd%20free%20trial';

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 390, height: 844 };

test.describe('Login landing page — desktop', () => {
  // No pre-loaded session — same pattern as tests/auth/login.spec.js.
  test.use({ storageState: { cookies: [], origins: [] }, viewport: DESKTOP });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders the landing UI, with no form visible until asked', async ({ page }) => {
    // trackConsoleErrors has to be attached before the navigation it audits,
    // and beforeEach has already navigated — so reload with the listeners on.
    const errors = trackConsoleErrors(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/login/);
    // getByRole excludes display:none subtrees from the accessibility tree,
    // so this also proves only one <h1> (desktop or mobile, not both) is
    // exposed at a time — the dual-tree responsive split isn't doubling up.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Built by Rural Root Cloud').first()).toBeVisible();

    // The form is behind the dialog, not on the page itself.
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByLabel('Password')).not.toBeVisible();

    // /auth/refresh 401s for every anonymous page load (AuthContext's mount
    // effect) — expected, not a bug; every other console/page/network error
    // still fails the test.
    assertNoErrors(errors, ['auth/refresh']);
  });

  test('"Start free trial" points at the trial contact email', async ({ page }) => {
    // No signup page exists yet (see docs/landing-page-mockup/PLAN.md, "Not
    // in this batch") — this CTA is a mailto to the one real contact channel
    // the plan keeps, not a dead "#" link.
    await expect(
      page.locator('.lp-nav').getByRole('link', { name: 'Start free trial' })
    ).toHaveAttribute('href', TRIAL_HREF);
  });

  test('the language switcher stays available before signing in', async ({ page }) => {
    await expect(
      page.locator('.lp-nav').getByRole('button', { name: 'Language settings' })
    ).toBeVisible();
  });

  test('"Log in" opens the form in a dialog, without leaving /login', async ({ page }) => {
    const dialog = await openLoginDialog(page);
    await expect(dialog.getByLabel('Email')).toBeVisible();
    await expect(dialog.getByLabel('Password')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('logging in through the dialog redirects to /dashboard', async ({ page }) => {
    const dialog = await openLoginDialog(page);
    await dialog.getByLabel('Email').fill(TEST_USERS.tenant_admin.email);
    await dialog.getByLabel('Password').fill(TEST_USERS.tenant_admin.password);
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('closing the dialog after a failed attempt and reopening it starts fresh', async ({
    page,
  }) => {
    let dialog = await openLoginDialog(page);
    await dialog.getByLabel('Email').fill(TEST_USERS.tenant_admin.email);
    await dialog.getByLabel('Password').fill('WrongPassword999!');
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await expect(dialog.getByText(/invalid credentials/i)).toBeVisible({ timeout: 8_000 });

    // Close without fixing it (Escape), then reopen.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    dialog = await openLoginDialog(page);
    await expect(dialog.getByText(/invalid credentials/i)).not.toBeVisible();
    await expect(dialog.getByLabel('Email')).toHaveValue('');
    await expect(dialog.getByLabel('Password')).toHaveValue('');
  });

  test('clicking the backdrop closes the dialog', async ({ page }) => {
    const dialog = await openLoginDialog(page);
    await page.mouse.click(10, 10);
    await expect(dialog).not.toBeVisible();
  });

  test("the dialog's close button closes it", async ({ page }) => {
    const dialog = await openLoginDialog(page);
    await dialog.getByRole('button', { name: /close/i }).click();
    await expect(dialog).not.toBeVisible();
  });

  test('shows only the desktop layout', async ({ page }) => {
    await expect(page.locator('.lp-nav')).toBeVisible();
    await expect(page.locator('.m-nav')).toBeHidden();
    await assertNoHorizontalOverflow(page);
  });

  test('in-page nav anchors scroll to their section', async ({ page }) => {
    await page.locator('.lp-nav').getByRole('link', { name: 'Security' }).click();
    await expect(page.locator('#security')).toBeInViewport();
  });
});

test.describe('Login landing page — mobile', () => {
  test.use({ storageState: { cookies: [], origins: [] }, viewport: MOBILE });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows only the mobile layout, plus the sticky CTA bar', async ({ page }) => {
    await expect(page.locator('.m-nav')).toBeVisible();
    await expect(page.locator('.lp-nav')).toBeHidden();
    await expect(page.locator('.m-sticky-cta')).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('the sticky bar "Log in" also opens the dialog', async ({ page }) => {
    const dialog = await openLoginDialog(page);
    await expect(dialog.getByLabel('Email')).toBeVisible();
  });
});

// The landing copy lives in the `landing` namespace of locales/{en,hi}.json.
// The third option, "Hindi + English", is not a file — i18n/mergeHiEn.js
// derives it as `${hi} / ${en}` per key, so it needs its own coverage.
test.describe('Login landing page — translation', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const HERO_EN = 'Run your school, college or coaching center';
  const HERO_HI = 'अपना स्कूल, कॉलेज या कोचिंग सेंटर चलाएँ';

  async function gotoIn(page, lang) {
    await page.addInitScript((l) => localStorage.setItem('app-lang', l), lang);
    await page.goto('/login');
    await page.locator('.lp-nav').waitFor({ state: 'visible' });
  }

  test('renders Hindi copy when the language is hi', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoIn(page, 'hi');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText(HERO_HI);
    await expect(h1).not.toContainText(HERO_EN);
    await expect(page.locator('.lp-hero p.lead')).toContainText('मल्टी-टेनेंट');
    // The switcher sets the document language alongside the copy.
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  });

  test('renders both languages when the language is hi_en', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoIn(page, 'hi_en');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText(HERO_HI);
    await expect(h1).toContainText(HERO_EN);
  });

  test('English is unchanged by the translation work', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await gotoIn(page, 'en');

    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText(HERO_EN);
    await expect(h1).not.toContainText(HERO_HI);
  });

  // The merged mode roughly doubles every string, which is the real layout
  // risk on a page this text-heavy — check both breakpoints in all three.
  for (const lang of ['en', 'hi', 'hi_en']) {
    for (const [name, vp] of [
      ['desktop', DESKTOP],
      ['mobile', MOBILE],
    ]) {
      test(`no horizontal overflow — ${name} / ${lang}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await page.addInitScript((l) => localStorage.setItem('app-lang', l), lang);
        await page.goto('/login');
        await page.locator(name === 'desktop' ? '.lp-nav' : '.m-nav').waitFor({ state: 'visible' });
        await assertNoHorizontalOverflow(page);
      });
    }
  }
});

test.describe('Login landing page — already authenticated', () => {
  // Deliberately not tenant_admin: tests/auth/login.spec.js's "Logout" test
  // blocklists the tenant_admin.json refresh token as a side effect, and
  // Playwright's file ordering means a spec sorting after login.spec.js can
  // inherit that invalidated session. principal is never logged out anywhere,
  // and this test doesn't care which role is authenticated.
  test.use({ storageState: AUTH_STATES.principal });

  test('visiting /login redirects straight to /dashboard, no landing page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
