import { test, expect } from '@playwright/test';
import { openLoginDialog, TEST_USERS } from '../fixtures/auth.js';

test.use({ storageState: { cookies: [], origins: [] } });

async function signInWithNoOrg(page) {
  const user = TEST_USERS.noOrg;
  await page.goto('/login');
  const dialog = await openLoginDialog(page);
  await dialog.getByLabel('Email').fill(user.email);
  await dialog.getByLabel('Password').fill(user.password);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('Join an organization: QR', () => {
  test('a scanned link prefills the code and does not submit', async ({ page }) => {
    await signInWithNoOrg(page);
    await page.goto('/orgs/join?code=RTED-ABCDE-FGH23');
    await expect(page.getByLabel('Join code')).toHaveValue('RTED-ABCDE-FGH23');
  });

  test('Scan QR opens the camera dialog, and a blocked camera says so', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    });
    await signInWithNoOrg(page);
    await page.goto('/orgs/join');
    await page.getByRole('button', { name: 'Scan QR code' }).click();
    await expect(page.getByRole('alert')).toContainText('Camera access was blocked');
    await page.getByRole('button', { name: 'Cancel' }).last().click();
    await expect(page.getByLabel('Join code')).toHaveValue('');
  });
});
