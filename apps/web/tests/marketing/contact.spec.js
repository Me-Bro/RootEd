import { test, expect } from '@playwright/test';

// Runs against the real POST /feedback endpoint — no mocking. Submitted as
// whatever identity the active storageState carries (or none), exercising
// decodeOptionalUser's best-effort attach either way.
test.describe('Landing page contact form', () => {
  test('submits and shows a success message', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Name').fill('E2E Visitor');
    await page.getByLabel('Email').fill('e2e-visitor@example.com');
    await page.getByLabel('Message').fill('Hello from the contact form e2e spec');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText("Thanks — we'll get back to you soon.")).toBeVisible();
  });
});
