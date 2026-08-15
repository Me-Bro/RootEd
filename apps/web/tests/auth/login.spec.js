import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth.js';

// Login tests run without any pre-loaded storageState
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders login form', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('RootEd')).toBeVisible();
  });

  test('valid credentials → redirect to /dashboard', async ({ page }) => {
    await page.getByLabel('Email').fill(TEST_USERS.super_admin.email);
    await page.getByLabel('Password').fill(TEST_USERS.super_admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('invalid password → shows error', async ({ page }) => {
    await page.getByLabel('Email').fill(TEST_USERS.super_admin.email);
    await page.getByLabel('Password').fill('WrongPassword999!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 8_000 });
  });

  test('wrong email → shows error', async ({ page }) => {
    await page.getByLabel('Email').fill('nobody@nowhere.invalid');
    await page.getByLabel('Password').fill('SomePassword123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 8_000 });
  });

  test('empty form → HTML5 required validation prevents submit', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Still on login page — no redirect
    await expect(page).toHaveURL(/\/login/);
  });

  test('tenant_admin login → redirect to /dashboard', async ({ page }) => {
    await page.getByLabel('Email').fill(TEST_USERS.tenant_admin.email);
    await page.getByLabel('Password').fill(TEST_USERS.tenant_admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
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
