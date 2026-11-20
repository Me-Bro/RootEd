import { test, expect } from '@playwright/test';
import { visibleText } from '../fixtures/dom.js';

// A student holds no staff permission, so no help topic applies to them. The
// contact form must still be reachable: it is gated by sign-in, not by permission.
test.describe('Contact support (student)', () => {
  test.use({ storageState: 'tests/fixtures/.auth/student.json' });

  test('the header Help button and the nav both lead to the contact form', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Help' }).click({ timeout: 15_000 });
    await page.getByRole('link', { name: 'Contact support' }).click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole('form', { name: 'Contact support' })).toBeVisible();

    await page.goto('/dashboard');
    await page.getByRole('link', { name: 'Help & support' }).first().click({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/help$/);
  });

  test('a signed-in user sends a message without retyping their name or email', async ({
    page,
  }) => {
    await page.goto('/help');
    const form = page.getByRole('form', { name: 'Contact support' });
    await expect(form).toBeVisible({ timeout: 15_000 });
    await expect(form.getByText(/We will reply to student@testschool\.local/)).toBeVisible();
    // Identity comes from the session: only the message is asked for.
    await expect(form.getByRole('textbox')).toHaveCount(1);

    const request = page.waitForRequest(
      (r) => r.url().endsWith('/feedback') && r.method() === 'POST'
    );
    await form.getByRole('textbox').fill('I cannot see my timetable.');
    await form.getByRole('button', { name: 'Send message' }).click();

    const body = (await request).postDataJSON();
    expect(body).toMatchObject({
      category: 'contact',
      email: 'student@testschool.local',
      message: 'I cannot see my timetable.',
    });
    await expect(visibleText(page, /your message has been sent/)).toBeVisible();
  });
});
