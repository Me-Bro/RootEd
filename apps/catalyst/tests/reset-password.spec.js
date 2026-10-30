import { test, expect } from '@playwright/test';

test.describe('password reset inside the portal', () => {
  test('sign-in links to the forgot-password page here, not the main app', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Forgot your password?' })
    ).toBeVisible();
  });

  test('asks the API for a portal link, and gives the same answer for any address', async ({
    page,
  }) => {
    let body;
    await page.route('**/auth/forgot-password', (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({
        json: { message: 'If that email exists, a reset link has been sent.' },
      });
    });
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByTestId('reset-sent')).toContainText('If that email has an account');
    expect(body).toEqual({ email: 'nobody@example.com', app: 'portal' });
  });

  test('a link without a token says so instead of showing a form', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('alert')).toContainText('incomplete');
    await expect(page.getByLabel('New password')).toHaveCount(0);
  });

  test('checks the two passwords match before calling the API', async ({ page }) => {
    let called = false;
    await page.route('**/auth/reset-password', (route) => {
      called = true;
      return route.fulfill({ json: {} });
    });
    await page.goto('/reset-password?token=abc');
    await page.getByLabel('New password', { exact: true }).fill('LongEnough123!');
    await page.getByLabel('Confirm new password').fill('Different123!');
    await page.getByRole('button', { name: 'Set password' }).click();
    await expect(page.getByRole('alert')).toContainText('do not match');
    expect(called).toBe(false);
  });

  test('sets the password and offers sign-in', async ({ page }) => {
    let body;
    await page.route('**/auth/reset-password', (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ json: { message: 'Password reset successful' } });
    });
    await page.goto('/reset-password?token=abc');
    await page.getByLabel('New password', { exact: true }).fill('LongEnough123!');
    await page.getByLabel('Confirm new password').fill('LongEnough123!');
    await page.getByRole('button', { name: 'Set password' }).click();
    await expect(page.getByTestId('reset-done')).toContainText('You can now sign in');
    expect(body).toEqual({ token: 'abc', password: 'LongEnough123!' });
  });

  test('an expired link shows the API message', async ({ page }) => {
    await page.route('**/auth/reset-password', (route) =>
      route.fulfill({ status: 400, json: { error: 'Invalid or expired reset token' } })
    );
    await page.goto('/reset-password?token=old');
    await page.getByLabel('New password', { exact: true }).fill('LongEnough123!');
    await page.getByLabel('Confirm new password').fill('LongEnough123!');
    await page.getByRole('button', { name: 'Set password' }).click();
    await expect(page.getByRole('alert').first()).toContainText('Invalid or expired reset token');
  });
});
