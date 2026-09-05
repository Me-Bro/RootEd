/**
 * Test credentials and auth helpers.
 * storageState files are created by tests/auth.setup.js before any e2e tests run.
 */
import path from 'path';

export const TEST_USERS = {
  super_admin: {
    email: 'admin@test.local',
    password: 'TestPass123!',
  },
  tenant_admin: {
    email: 'tadmin@testschool.local',
    password: 'TestPass123!',
  },
  teacher: {
    email: 'teacher@testschool.local',
    password: 'TestPass123!',
  },
  viewer: {
    email: 'viewer@testschool.local',
    password: 'TestPass123!',
  },
  principal: {
    email: 'principal@testschool.local',
    password: 'TestPass123!',
  },
  accountant: {
    email: 'accountant@testschool.local',
    password: 'TestPass123!',
  },
  multiTenant: {
    email: 'multi@testschool.local',
    password: 'TestPass123!',
  },
};

export const TEST_TENANT = {
  subdomain: 'testschool',
  name: 'Test School',
};

const AUTH_DIR = path.join(import.meta.dirname, '.auth');

export const AUTH_STATES = {
  super_admin: path.join(AUTH_DIR, 'super_admin.json'),
  tenant_admin: path.join(AUTH_DIR, 'tenant_admin.json'),
  teacher: path.join(AUTH_DIR, 'teacher.json'),
  viewer: path.join(AUTH_DIR, 'viewer.json'),
  principal: path.join(AUTH_DIR, 'principal.json'),
};

/**
 * Open the login dialog on /login and submit the form in it.
 * Waits for redirect to /dashboard.
 *
 * /login renders the landing page UI (components/marketing/LandingView.jsx)
 * with sign-in behind a dialog, so the form has to be opened first — see
 * openLoginDialog below.
 */
export async function loginViaUi(page, email, password) {
  await page.goto('/login');
  const dialog = await openLoginDialog(page);
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByLabel('Password').fill(password);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

/**
 * Clicks the login CTA on the landing page and returns the opened dialog
 * locator, so specs can scope form queries to it. Assumes the page is
 * already on /login.
 *
 * Located by structure rather than by accessible name, for two reasons:
 *  - **Language.** The landing copy is translated (`landing.*` in the locale
 *    files), so the label is "Log in" / "लॉग इन" / "लॉग इन / Log in"
 *    depending on the active language. Matching the English text broke all
 *    four tests in tests/i18n/language-switch.spec.js.
 *  - **Viewport.** The page renders a desktop and a mobile tree and hides one
 *    with CSS at the `md` breakpoint; the CTA lives in the desktop nav and in
 *    the mobile sticky bar respectively. `:visible` picks whichever tree is
 *    actually showing.
 *
 * In both containers the login CTA is the only `button.btn` — the adjacent
 * "Start free trial" is an `<a>`, and the language switcher has no `.btn`.
 */
export async function openLoginDialog(page) {
  await page
    .locator('.lp-nav .cta button.btn:visible, .m-sticky-cta button.btn:visible')
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  return dialog;
}
