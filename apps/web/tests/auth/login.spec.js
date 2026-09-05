import { test, expect } from '@playwright/test';
import { TEST_USERS, openLoginDialog } from '../fixtures/auth.js';

// Login tests run without any pre-loaded storageState
test.use({ storageState: { cookies: [], origins: [] } });

// /login renders the approved landing page UI with sign-in in a dialog (see
// pages/auth/LoginPage.jsx), so each test opens that dialog first and scopes
// its form queries to it.
test.describe('Login', () => {
  let dialog;

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    dialog = await openLoginDialog(page);
  });

  test('renders login form', async () => {
    await expect(dialog.getByLabel('Email')).toBeVisible();
    await expect(dialog.getByLabel('Password')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('valid credentials → redirect to /dashboard', async ({ page }) => {
    await dialog.getByLabel('Email').fill(TEST_USERS.super_admin.email);
    await dialog.getByLabel('Password').fill(TEST_USERS.super_admin.password);
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('invalid password → shows error', async () => {
    await dialog.getByLabel('Email').fill(TEST_USERS.super_admin.email);
    await dialog.getByLabel('Password').fill('WrongPassword999!');
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await expect(dialog.getByText(/invalid credentials/i)).toBeVisible({ timeout: 8_000 });
  });

  test('wrong email → shows error', async () => {
    await dialog.getByLabel('Email').fill('nobody@nowhere.invalid');
    await dialog.getByLabel('Password').fill('SomePassword123!');
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await expect(dialog.getByText(/invalid credentials/i)).toBeVisible({ timeout: 8_000 });
  });

  test('empty form → HTML5 required validation prevents submit', async ({ page }) => {
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    // Still on /login with the dialog open — no redirect
    await expect(page).toHaveURL(/\/login/);
    await expect(dialog).toBeVisible();
  });

  test('tenant_admin login → redirect to /dashboard', async ({ page }) => {
    await dialog.getByLabel('Email').fill(TEST_USERS.tenant_admin.email);
    await dialog.getByLabel('Password').fill(TEST_USERS.tenant_admin.password);
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('Authenticated redirect', () => {
  // Use tenant_admin state to verify already-authenticated users skip login
  test.use({ storageState: 'tests/fixtures/.auth/tenant_admin.json' });

  test('visiting /login redirects to /dashboard when already authed', async ({ page }) => {
    await page.goto('/login');
    // AuthContext refreshes token on mount and redirects if already logged in
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('Logout', () => {
  test.use({ storageState: 'tests/fixtures/.auth/tenant_admin.json' });

  test('logout clears session and redirects to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Logout' }).click();

    await page.waitForURL('**/login', { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
