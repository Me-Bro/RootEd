import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

const row = (page, admissionNo) => page.getByTestId(`student-row-${admissionNo}`);
const state = (r) => r.getByTestId('login-state');

test.describe('administrator manages student logins', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('shows who can sign in and who has no login yet', async ({ page }) => {
    await page.goto('/people/students');
    await expect(state(row(page, '2025-TEST-001'))).toHaveText('Active');
    await expect(row(page, '2025-TEST-001')).toContainText('student@testschool.local');
    await expect(state(row(page, '2025-TEST-005'))).toHaveText('No login');
  });

  test('searches by name', async ({ page }) => {
    await page.goto('/people/students');
    await page.getByLabel('Search by name or admission no.').fill('Student5');
    await expect(row(page, '2025-TEST-005')).toBeVisible();
    await expect(row(page, '2025-TEST-001')).toHaveCount(0);
  });

  test('gives a login, resends the link, suspends and reactivates', async ({ page }) => {
    await page.goto('/people/students');
    const r = row(page, '2025-TEST-009');
    await expect(state(r)).toHaveText('No login');

    await page.getByRole('button', { name: 'Give login to Student9 Test' }).click();
    await page.getByLabel('Email for Student9 Test').fill('student9@testschool.local');
    await page.getByRole('button', { name: 'Send link', exact: true }).click();
    await expect(state(r)).toHaveText('Waiting for password');
    await expect(r).toContainText('student9@testschool.local');

    await page.getByRole('button', { name: 'Resend link to Student9 Test' }).click();
    await expect(page.getByText('Link sent')).toBeVisible();

    // suspending asks first
    await page.getByRole('button', { name: 'Suspend Student9 Test' }).click();
    await expect(state(r)).toHaveText('Waiting for password');
    await page.getByRole('button', { name: 'Confirm suspending Student9 Test' }).click();
    await expect(state(r)).toHaveText('Suspended');

    await page.getByRole('button', { name: 'Reactivate Student9 Test' }).click();
    await expect(state(r)).toHaveText('Waiting for password');
  });

  test('refuses an address that already belongs to another student', async ({ page }) => {
    await page.goto('/people/students');
    await page.getByRole('button', { name: 'Give login to Student10 Test' }).click();
    await page.getByLabel('Email for Student10 Test').fill('student@testschool.local');
    await page.getByRole('button', { name: 'Send link', exact: true }).click();
    await expect(page.getByText(/already linked to another student/)).toBeVisible();
    await expect(state(row(page, '2025-TEST-010'))).toHaveText('No login');
  });

  test('adds a student with a login from the form', async ({ page }) => {
    await page.goto('/people/students');
    await page.getByRole('button', { name: 'Add student' }).click();
    const form = page.getByRole('form', { name: 'Add a student' });
    await form.getByLabel('Admission no.').fill('E2E-001');
    await form.getByLabel('First name').fill('Eva');
    await form.getByLabel('Last name').fill('Rao');
    await form.getByLabel('Email (optional, gives a login)').fill('eva.e2e@testschool.local');
    await form.getByRole('button', { name: 'Add student' }).click();

    await expect(state(row(page, 'E2E-001'))).toHaveText('Waiting for password');
    await expect(row(page, 'E2E-001')).toContainText('Eva Rao');
  });

  test('imports a CSV into the chosen batch', async ({ page }) => {
    await page.goto('/people/students');
    await page.getByRole('button', { name: 'Import CSV' }).click();
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeDisabled();

    await page.getByLabel('Batch for these students').selectOption({ index: 1 });
    await page.getByLabel('CSV file').setInputFiles({
      name: 'students.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'admissionNo,firstName,lastName,email\nE2E-100,Imp,One,imp1@testschool.local\nE2E-101,Imp,Two,\n'
      ),
    });
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    await expect(page.getByTestId('import-result')).toContainText(
      '2 added, 0 already on the roll, 1 logins sent.'
    );
    await expect(state(row(page, 'E2E-100'))).toHaveText('Waiting for password');
    await expect(state(row(page, 'E2E-101'))).toHaveText('No login');
  });

  test('downloads a sample CSV', async ({ page }) => {
    await page.goto('/people/students');
    await page.getByRole('button', { name: 'Import CSV' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download a sample' }).click();
    expect((await download).suggestedFilename()).toBe('students-sample.csv');
  });
});

test.describe('who sees what', () => {
  test('a mentor sees the roster but no logins and no actions', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH_STATES.teacher });
    const page = await ctx.newPage();
    await page.goto('/people/students');
    await expect(row(page, '2025-TEST-001')).toBeVisible();
    await expect(page.getByTestId('login-state')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add student' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Import CSV' })).toHaveCount(0);
    await ctx.close();
  });

  test('a mentor has no Team page', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH_STATES.teacher });
    const page = await ctx.newPage();
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Students' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Team' })).toHaveCount(0);
    await page.goto('/people/team');
    await expect(page).toHaveURL(/\/dashboard/);
    await ctx.close();
  });

  test('the TPO (principal) can look but not change', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH_STATES.principal });
    const page = await ctx.newPage();
    await page.goto('/people/students');
    await expect(row(page, '2025-TEST-001')).toBeVisible();
    await expect(page.getByTestId('login-state')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add student' })).toHaveCount(0);

    await page.goto('/people/team');
    await expect(page.getByTestId('person-row-tadmin@testschool.local')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add person' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(0);
    await ctx.close();
  });

  test('a student has neither page', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH_STATES.student });
    const page = await ctx.newPage();
    await page.goto('/people/students');
    await expect(page).toHaveURL(/\/me\/progress/);
    await page.goto('/people/team');
    await expect(page).toHaveURL(/\/me\/progress/);
    await ctx.close();
  });
});

test.describe('administrator manages the team', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });
  const person = (page, email) => page.getByTestId(`person-row-${email}`);
  const EMAIL = 'meera.e2e@testschool.local';

  test('lists the team, with no actions on your own row', async ({ page }) => {
    await page.goto('/people/team');
    const me = person(page, 'tadmin@testschool.local');
    await expect(me).toContainText('You');
    await expect(me.getByRole('button')).toHaveCount(0);
    await expect(person(page, 'teacher@testschool.local')).toBeVisible();
    // students are not team members
    await expect(person(page, 'student@testschool.local')).toHaveCount(0);
  });

  test('adds a mentor, changes the role, suspends, reactivates and removes', async ({ page }) => {
    await page.goto('/people/team');
    await page.getByRole('button', { name: 'Add person' }).click();
    const form = page.getByRole('form', { name: 'Add a team member' });
    await form.getByLabel('First name').fill('Meera');
    await form.getByLabel('Last name').fill('Nair');
    await form.getByLabel('Email').fill(EMAIL);
    await form.getByLabel('Role').selectOption({ label: 'teacher' });
    await form.getByRole('button', { name: 'Add person' }).click();

    const r = person(page, EMAIL);
    await expect(r).toContainText('Meera Nair');
    await expect(state(r)).toHaveText('Waiting for password');

    await r.getByLabel('Role for Meera Nair', { exact: true }).selectOption({ label: 'librarian' });
    await r.getByRole('button', { name: 'Save role for Meera Nair' }).click();
    await page.reload();
    await expect(
      person(page, EMAIL)
        .getByLabel('Role for Meera Nair', { exact: true })
        .locator('option:checked')
    ).toHaveText('librarian');

    await page.getByRole('button', { name: 'Resend link to Meera Nair' }).click();
    await expect(page.getByText('Link sent')).toBeVisible();

    await page.getByRole('button', { name: 'Suspend Meera Nair' }).click();
    await page.getByRole('button', { name: 'Confirm suspending Meera Nair' }).click();
    await expect(state(person(page, EMAIL))).toHaveText('Suspended');
    await page.getByRole('button', { name: 'Reactivate Meera Nair' }).click();
    await expect(state(person(page, EMAIL))).toHaveText('Waiting for password');

    // removing asks first
    await page.getByRole('button', { name: 'Remove Meera Nair' }).click();
    await expect(person(page, EMAIL)).toBeVisible();
    await page.getByRole('button', { name: 'Confirm removing Meera Nair' }).click();
    await expect(person(page, EMAIL)).toHaveCount(0);
  });

  test('adding someone who is already on the team is refused', async ({ page }) => {
    await page.goto('/people/team');
    await page.getByRole('button', { name: 'Add person' }).click();
    const form = page.getByRole('form', { name: 'Add a team member' });
    await form.getByLabel('First name').fill('Tara');
    await form.getByLabel('Last name').fill('Teacher');
    await form.getByLabel('Email').fill('teacher@testschool.local');
    await form.getByRole('button', { name: 'Add person' }).click();
    await expect(page.getByText(/already a member/)).toBeVisible();
  });
});

test.describe('the welcome link', () => {
  test('a claim link says welcome, not reset', async ({ page }) => {
    await page.goto('/reset-password?token=abc&welcome=1');
    await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
    await expect(page.getByText('Choose a password to activate your account.')).toBeVisible();
  });
});

test.describe('people waiting to join', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  // Nobody can be put in the "waiting" state through the portal itself (the join
  // code is entered in the main app), so the queue is fed from a stubbed response.
  test('approves one with a chosen role and rejects another', async ({ page }) => {
    const waiting = [
      {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
        userId: { email: 'late@x.test', firstName: 'Lata', lastName: 'Late' },
        requestNote: 'Trainer from the partner firm',
      },
      {
        _id: 'aaaaaaaaaaaaaaaaaaaaaaa2',
        userId: { email: 'other@x.test', firstName: 'Omi', lastName: 'Other' },
      },
    ];
    const calls = [];
    await page.route('**/__api/tenant/join-requests', (route) => route.fulfill({ json: waiting }));
    await page.route('**/__api/tenant/join-requests/*/*', (route) => {
      calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      return route.fulfill({ json: {} });
    });

    await page.goto('/people/team');
    const card = page.getByTestId('join-requests');
    await expect(card).toContainText('Lata Late');
    await expect(card).toContainText('Trainer from the partner firm');

    await card.getByLabel('Role for Lata Late', { exact: true }).selectOption({ label: 'teacher' });
    await card.getByRole('button', { name: 'Approve Lata Late' }).click();
    await card.getByRole('button', { name: 'Reject Omi Other' }).click();

    await expect.poll(() => calls.length).toBe(2);
    expect(calls[0]).toMatch(/POST .*\/join-requests\/aaaaaaaaaaaaaaaaaaaaaaa1\/approve/);
    expect(calls[1]).toMatch(/POST .*\/join-requests\/aaaaaaaaaaaaaaaaaaaaaaa2\/reject/);
  });

  test('shows nothing when no one is waiting', async ({ page }) => {
    await page.goto('/people/team');
    await expect(page.getByTestId('person-row-tadmin@testschool.local')).toBeVisible();
    await expect(page.getByTestId('join-requests')).toHaveCount(0);
  });
});
