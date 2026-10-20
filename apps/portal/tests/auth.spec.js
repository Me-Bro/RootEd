import { test, expect } from '@playwright/test';
import { TEST_USERS, AUTH_STATES, loginViaUi } from './fixtures/auth.js';

test.describe('signing in', () => {
  test('a trainer lands on the dashboard of their college', async ({ page }) => {
    await loginViaUi(page, TEST_USERS.teacher);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('RR Cloud Career Catalyst').first()).toBeVisible();
    await expect(page.getByText('Test School')).toBeVisible();
  });

  test('a student lands on their own progress, and sees no staff navigation', async ({ page }) => {
    await loginViaUi(page, TEST_USERS.student);
    await expect(page).toHaveURL(/\/me\/progress$/);
    await expect(page.getByRole('heading', { level: 1, name: 'My progress' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Assignments' })).toHaveCount(0);
  });

  test('the platform admin lands on the cross-college outcomes page', async ({ page }) => {
    await loginViaUi(page, TEST_USERS.super_admin);
    await expect(page).toHaveURL(/\/outcomes$/);
  });

  test('a wrong password shows an error and stays on the sign-in page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill(TEST_USERS.teacher.email);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('anyone not signed in is sent to the sign-in page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('signing out', () => {
  // A fresh sign-in of its own: signing out revokes the refresh token, which would
  // break every later spec if it used the shared stored session.
  test('returns to the sign-in page and ends the session', async ({ page }) => {
    await loginViaUi(page, TEST_USERS.principal);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('a page you may not open sends you where you belong', () => {
  test('a trainer cannot open the cross-college page', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STATES.teacher });
    const page = await context.newPage();
    await page.goto('/outcomes');
    await expect(page).toHaveURL(/\/dashboard$/);
    await context.close();
  });

  test('a TPO has no student progress page of their own', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STATES.principal });
    const page = await context.newPage();
    await page.goto('/me/progress');
    await expect(page).toHaveURL(/\/dashboard$/);
    await context.close();
  });

  test('a student cannot open the staff dashboard', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STATES.student });
    const page = await context.newPage();
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/me\/progress$/);
    await context.close();
  });
});
