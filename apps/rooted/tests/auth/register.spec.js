import { test, expect } from '@playwright/test';
import { visibleText } from '../fixtures/dom.js';
import { openLoginDialog } from '../fixtures/auth.js';

// Registration is reached from the portal host with no session at all.
test.use({ storageState: { cookies: [], origins: [] } });

const unique = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

test.describe('Registration', () => {
  test('the sign-in dialog offers a way to create an account', async ({ page }) => {
    await page.goto('/login');
    const dialog = await openLoginDialog(page);
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('registering lands on the check-your-email step', async ({ page }) => {
    const id = unique();
    await page.goto('/register');

    await page.getByLabel('First name').fill('Rita');
    await page.getByLabel('Last name').fill('Bose');
    await page.getByLabel('Email').fill(`${id}@school.edu`);
    await page.getByLabel('Username').fill(id);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm password').fill('password123');

    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/check-email/);
    await expect(visibleText(page, /check your email/i)).toBeVisible({ timeout: 10_000 });
    await expect(visibleText(page, `${id}@school.edu`)).toBeVisible();
  });

  test('an unverified account cannot sign in yet', async ({ page }) => {
    const id = unique();
    await page.goto('/register');
    await page.getByLabel('First name').fill('Un');
    await page.getByLabel('Last name').fill('Verified');
    await page.getByLabel('Email').fill(`${id}@school.edu`);
    await page.getByLabel('Username').fill(id);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/check-email/);

    // The API refuses pending_verification at login, and the UI must surface
    // that rather than appearing to succeed.
    await page.goto('/login');
    const dialog = await openLoginDialog(page);
    await dialog.getByLabel('Email').fill(`${id}@school.edu`);
    await dialog.getByLabel('Password').fill('password123');
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    await expect(dialog.getByText(/verify your email/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('mismatched passwords are caught before the request', async ({ page }) => {
    const id = unique();
    await page.goto('/register');
    await page.getByLabel('First name').fill('Mis');
    await page.getByLabel('Last name').fill('Match');
    await page.getByLabel('Email').fill(`${id}@school.edu`);
    await page.getByLabel('Username').fill(id);
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm password').fill('password456');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('alert')).toContainText(/do not match/i);
    await expect(page).toHaveURL(/\/register/);
  });

  test('a reserved username is refused', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('First name').fill('Res');
    await page.getByLabel('Last name').fill('Erved');
    await page.getByLabel('Email').fill(`${unique()}@school.edu`);
    await page.getByLabel('Username').fill('support');
    await page.getByLabel('Password', { exact: true }).fill('password123');
    await page.getByLabel('Confirm password').fill('password123');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('alert')).toContainText(/reserved/i);
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe('Verification and password reset pages', () => {
  test('a verification link with no token explains itself', async ({ page }) => {
    await page.goto('/verify-email');
    await expect(visibleText(page, /did not work/i)).toBeVisible();
  });

  test('an invalid verification token is reported, not silently ignored', async ({ page }) => {
    await page.goto('/verify-email?token=not-a-real-token');
    // The API's own wording is surfaced ("Invalid or expired verification
    // link"), falling back to the translated string only if it sends none.
    await expect(visibleText(page, /did not work/i)).toBeVisible({ timeout: 10_000 });
    await expect(visibleText(page, /expired/i)).toBeVisible();
  });

  test('forgot password answers the same way for any address', async ({ page }) => {
    // The endpoint deliberately does not reveal whether the address exists, and
    // neither may the page — this used to link to a route that did not exist.
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nobody@nowhere.invalid');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(visibleText(page, /if that email exists/i)).toBeVisible({ timeout: 10_000 });
  });
});
