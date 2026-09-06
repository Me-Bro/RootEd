import { test, expect } from '@playwright/test';
import { visibleText } from '../fixtures/dom.js';

const unique = () => `e2e-m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

test.describe('Members administration', () => {
  test.use({ storageState: 'tests/fixtures/.auth/tenant_admin.json' });

  test('lists the seeded members with their roles', async ({ page }) => {
    await page.goto('/tenant/members');
    await expect(visibleText(page, /teacher@testschool.local/).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Change roles' }).first()).toBeVisible();
  });

  test('an invitation appears in the list and can be revoked', async ({ page }) => {
    const email = `${unique()}@school.edu`;
    await page.goto('/tenant/members');
    await page.getByRole('button', { name: 'Invitations' }).click();

    await page.getByLabel('Email address to invite').fill(email);
    // Roles are mandatory: the API refuses an invitation with none, so the
    // button stays disabled until one is picked.
    const send = page.getByRole('button', { name: 'Send invitation' });
    await expect(send).toBeDisabled();
    await page.getByText('teacher', { exact: true }).click();
    await send.click();

    await expect(visibleText(page, email)).toBeVisible({ timeout: 15_000 });

    await page
      .locator('div')
      .filter({ hasText: email })
      .getByRole('button', { name: 'Revoke' })
      .first()
      .click();
    await expect(visibleText(page, email)).toBeHidden({ timeout: 15_000 });
  });

  test('the join-requests queue renders', async ({ page }) => {
    await page.goto('/tenant/members');
    await page.getByRole('button', { name: 'Requests' }).click();
    // Nothing is seeded pending, so the empty state is the correct answer.
    await expect(visibleText(page, /no requests waiting/i)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Members administration — without roles:write', () => {
  test.use({ storageState: 'tests/fixtures/.auth/teacher.json' });

  test('a teacher cannot reach the join policy', async ({ page }) => {
    // In the teacher describe, not the tenant_admin one: an admin is correctly
    // *not* redirected, so this asserted nothing where it first sat.
    await page.goto('/tenant/join-policy');
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    // The join code is never served to them either — GET /tenant/join-policy
    // is behind tenant:admin and answers 403.
    await expect(page.locator('p.font-mono')).toBeHidden();
  });

  test('a teacher cannot reach the members page at all', async ({ page }) => {
    // roles:read gates the route, and the teacher template does not carry it.
    // waitForURL, not toHaveURL: the guard can only decide once /auth/me has
    // resolved the caller's permissions, so the redirect happens after the
    // initial navigation settles.
    await page.goto('/tenant/members');
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
  });
});

test.describe('Join policy', () => {
  test.use({ storageState: 'tests/fixtures/.auth/tenant_admin.json' });

  test('opening the door issues a code, and rotating replaces it', async ({ page }) => {
    await page.goto('/tenant/join-policy');
    await expect(visibleText(page, /who can join/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('radio', { name: /anyone with the join code/i }).check();
    await page.getByRole('button', { name: 'Save' }).click();

    const code = page.locator('p.font-mono');
    await expect(code).toBeVisible({ timeout: 15_000 });
    const first = await code.textContent();
    expect(first).toMatch(/^RTED-/);

    await page.getByRole('button', { name: /generate a new code/i }).click();
    await expect
      .poll(async () => (await code.textContent())?.trim(), { timeout: 15_000 })
      .not.toBe(first?.trim());
  });

  test('auto-approval cannot be enabled without naming the roles', async ({ page }) => {
    await page.goto('/tenant/join-policy');
    await page.getByRole('radio', { name: /anyone with the join code/i }).check();
    await page.getByRole('checkbox', { name: /approve automatically/i }).check();
    await page.getByRole('button', { name: 'Save' }).click();

    // The API refuses: handing out roles with nobody in the loop needs the
    // roles named first.
    await expect(page.getByRole('alert')).toContainText(/roles/i, { timeout: 15_000 });
  });
});

test.describe('Account settings', () => {
  test.use({ storageState: 'tests/fixtures/.auth/teacher.json' });

  test('any signed-in user can reach their own settings', async ({ page }) => {
    // Deliberately not permission-gated: these belong to the person, not the
    // organization.
    await page.goto('/settings/account');
    await expect(visibleText(page, /account settings/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('the profile can be saved', async ({ page }) => {
    await page.goto('/settings/account');
    await page.getByLabel('Phone').fill('+91 90000 00001');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(visibleText(page, /profile saved/i)).toBeVisible({ timeout: 15_000 });
  });

  test('an email change needs the current password', async ({ page }) => {
    await page.goto('/settings/account');
    // 'Current password' labels an input in both the email and password cards,
    // so scope to the form that owns this one.
    const emailForm = page.locator('form').filter({ hasText: 'New email address' });
    await emailForm.getByLabel('New email address').fill(`${unique()}@school.edu`);
    await emailForm.getByLabel('Current password').fill('WrongPassword999!');
    await emailForm.getByRole('button', { name: 'Send confirmation' }).click();
    await expect(visibleText(page, /incorrect password/i)).toBeVisible({ timeout: 15_000 });
  });
});
