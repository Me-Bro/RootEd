import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestApiClient, createStudent } from '../fixtures/data.js';
import { AUTH_STATES } from '../fixtures/auth.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// A valid Aadhaar (Verhoeff checksum) and one that fails the check.
const AADHAAR = '234567890124';
const BAD_AADHAAR = '234567890125';

const unique = () => `PF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

async function openAddDialog(page) {
  await page.goto('/academic/students');
  await page.getByRole('button', { name: 'Add Student' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function fillBasics(dialog, admissionNo, first = 'Profile') {
  await dialog.getByLabel('Admission No').fill(admissionNo);
  await dialog.getByLabel('First Name').fill(first);
  await dialog.getByLabel('Last Name').fill('Tester');
}

test.describe('Add student: richer profile', () => {
  test('captures mobile, WhatsApp, guardian, address and health, and the profile shows them', async ({
    page,
  }) => {
    const dialog = await openAddDialog(page);
    const admissionNo = unique();
    await fillBasics(dialog, admissionNo, 'Rich');

    const contact = dialog.getByRole('group', { name: 'Contact' });
    await contact.getByLabel('Student mobile').fill('+91 98765 43210');
    await contact.getByLabel('Same as phone number').check();
    // The separate WhatsApp box is not needed while "same as phone" is on.
    await expect(contact.getByLabel('WhatsApp number')).toBeDisabled();

    await dialog.getByLabel('Admission date').fill('2024-04-01');

    await dialog.getByRole('button', { name: 'Add Contact' }).click();
    const guardian = dialog.getByRole('group', { name: 'Guardian 1' });
    await guardian.getByLabel('Name', { exact: true }).fill('Ravi Tester');
    await guardian.getByLabel('Phone', { exact: true }).fill('9876543212');
    await guardian.getByLabel('Relation', { exact: true }).fill('father');
    await guardian.getByLabel('Email', { exact: true }).fill('ravi@example.com');
    await guardian.getByLabel('WhatsApp number').fill('9876543299');
    await guardian.getByLabel('Primary contact').check();
    await guardian.getByLabel('Emergency contact').check();

    await dialog.getByText('Address', { exact: true }).click();
    await dialog.getByLabel('Address line 1').fill('1 Main Rd');
    await dialog.getByLabel('City').fill('Pune');
    await dialog.getByLabel('State').fill('Maharashtra');
    await dialog.getByLabel('PIN code').fill('411001');

    await dialog.getByText('Health', { exact: true }).click();
    await dialog.getByLabel('Blood group').selectOption('O+');
    await dialog.getByLabel('Allergies').fill('Peanuts');

    await dialog.getByRole('button', { name: 'Add Student' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('status')).toContainText('Rich Tester added');

    // Open the new student's profile.
    await page.getByPlaceholder(/search/i).fill(admissionNo);
    await page.getByRole('link', { name: new RegExp(admissionNo) }).click();

    await expect(page.getByText('9876543210').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'WhatsApp' }).first()).toHaveAttribute(
      'href',
      'https://wa.me/919876543210'
    );
    await expect(page.getByText('1 Main Rd')).toBeVisible();
    await expect(page.getByText('411001')).toBeVisible();
    await expect(page.getByText('O+')).toBeVisible();
    await expect(page.getByText('Peanuts')).toBeVisible();
    await expect(page.getByText('Ravi Tester')).toBeVisible();
    await expect(page.getByText('Primary', { exact: true })).toBeVisible();
    await expect(page.getByText('Emergency', { exact: true })).toBeVisible();
  });

  test('a bad mobile number is refused with a clear message', async ({ page }) => {
    const dialog = await openAddDialog(page);
    await fillBasics(dialog, unique());
    await dialog.getByRole('group', { name: 'Contact' }).getByLabel('Student mobile').fill('123');
    await dialog.getByRole('button', { name: 'Add Student' }).click();
    await expect(dialog.getByText('Enter a valid 10-digit mobile number')).toBeVisible({
      timeout: 8_000,
    });
  });

  test('an email gives the student a login, and says so', async ({ page }) => {
    const email = `pf.${Date.now()}@school.test`;
    const dialog = await openAddDialog(page);
    await fillBasics(dialog, unique(), 'Login');
    await dialog.getByLabel(/Student email/).fill(email);
    await dialog.getByRole('button', { name: 'Add Student' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('status')).toContainText(`A login link was sent to ${email}`);
  });

  test('the student is still added when the login cannot be made, and the reason shows', async ({
    page,
    request,
  }) => {
    // Link an email to one student, then reuse it for another.
    const client = await createTestApiClient(request, 'tenant_admin');
    const email = `twin.${Date.now()}@school.test`;
    await createStudent(client, { firstName: 'First', lastName: 'Twin', email });

    const dialog = await openAddDialog(page);
    await fillBasics(dialog, unique(), 'Second');
    await dialog.getByLabel(/Student email/).fill(email);
    await dialog.getByRole('button', { name: 'Add Student' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole('status')).toContainText('Second Tester was added');
    await expect(page.getByRole('status')).toContainText('already linked');
  });

  test('a school sees school-only fields', async ({ page }) => {
    const dialog = await openAddDialog(page);
    await dialog.getByText('Other details', { exact: true }).click();
    await expect(dialog.getByLabel('Category')).toBeVisible();
    await expect(dialog.getByLabel('Previous school')).toBeVisible();
    await expect(dialog.getByLabel('Exam target')).toHaveCount(0);
  });

  test('the existing form fields keep their order (section first, then gender)', async ({
    page,
  }) => {
    const dialog = await openAddDialog(page);
    await expect(dialog.locator('select').first()).toHaveAccessibleName(/Section/);
    await expect(dialog.locator('select').nth(1)).toHaveAccessibleName(/Gender/);
  });
});

test.describe('Edit student: richer profile', () => {
  test('saves with an untouched blank guardian row, and keeps existing guardians', async ({
    page,
    request,
  }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    const student = await createStudent(client, {
      firstName: 'Keep',
      lastName: 'Guardians',
      parentContacts: [{ name: 'Old Guardian', phone: '9123456780', relation: 'mother' }],
    });

    await page.goto(`/academic/students/${student._id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Add Contact' }).click(); // left blank
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Old Guardian')).toBeVisible();
  });

  test('only one guardian can be primary', async ({ page, request }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    const student = await createStudent(client, {
      firstName: 'Two',
      lastName: 'Guardians',
      parentContacts: [
        { name: 'One', phone: '9123456781', isPrimary: true },
        { name: 'Two', phone: '9123456782' },
      ],
    });
    await page.goto(`/academic/students/${student._id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog');
    const first = dialog.getByRole('group', { name: 'Guardian 1' }).getByLabel('Primary contact');
    const second = dialog.getByRole('group', { name: 'Guardian 2' }).getByLabel('Primary contact');
    await expect(first).toBeChecked();
    await second.check();
    await expect(first).not.toBeChecked();
  });

  test('records a reason when withdrawing, and shows it on the profile', async ({
    page,
    request,
  }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    const student = await createStudent(client, { firstName: 'Reason', lastName: 'Given' });
    await page.goto(`/academic/students/${student._id}`);
    await page.getByRole('button', { name: 'Mark Withdrawn' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason (optional)').fill('Moved city');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Moved city')).toBeVisible();
  });

  test('Aadhaar: a bad number is refused, a good one is saved masked, and it can be removed', async ({
    page,
    request,
  }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    const student = await createStudent(client, { firstName: 'Masked', lastName: 'Id' });
    await page.goto(`/academic/students/${student._id}`);

    await page.getByRole('button', { name: 'Edit' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByText('Other details', { exact: true }).click();
    await dialog.getByLabel('Aadhaar number').fill(BAD_AADHAAR);
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog.getByText('Enter a valid 12-digit Aadhaar number')).toBeVisible({
      timeout: 8_000,
    });

    await dialog.getByLabel('Aadhaar number').fill(AADHAAR);
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('XXXX XXXX 0124')).toBeVisible();
    // The full number is never on the page.
    await expect(page.getByText(AADHAAR)).toHaveCount(0);

    // Showing the full number is a deliberate, audited click, and can be undone.
    await page.getByRole('button', { name: 'Show full number' }).click();
    await expect(page.getByText('2345 6789 0124')).toBeVisible();
    await page.getByRole('button', { name: 'Hide' }).click();
    await expect(page.getByText('XXXX XXXX 0124')).toBeVisible();
    await expect(page.getByText('2345 6789 0124')).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByText('Other details', { exact: true }).click();
    await dialog.getByLabel('Remove saved Aadhaar').check();
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('XXXX XXXX 0124')).toHaveCount(0);
  });

  test('a school can record a category, and it shows on the profile', async ({ page, request }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    const student = await createStudent(client, { firstName: 'Cat', lastName: 'Egory' });
    await page.goto(`/academic/students/${student._id}`);
    await page.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Other details', { exact: true }).click();
    await dialog.getByLabel('Category').selectOption('obc');
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('OBC')).toBeVisible();
  });
});

test.describe('Documents: type', () => {
  test('the chosen type is sent with the upload and shown on the file', async ({
    page,
    request,
  }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    const student = await createStudent(client, { firstName: 'Resume', lastName: 'Holder' });

    // Storage (Minio) is not needed to check what the browser sends.
    let body = '';
    await page.route('**/documents', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      body = route.request().postData() ?? '';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ document: { name: 'cv.pdf', kind: 'resume' } }),
      });
    });

    await page.goto(`/academic/students/${student._id}`);
    await page.getByLabel('Document type').selectOption('resume');
    await page.locator('input[type="file"]:not([accept])').setInputFiles({
      name: 'cv.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 cv'),
    });
    await expect.poll(() => body).toMatch(/name="kind"\s+resume/);
  });
});

// Student12 is seeded with a full profile (see seed-test-data.js): contact and
// WhatsApp, a primary and an emergency guardian, address, health, school fields,
// a withdrawal-style reason and an Aadhaar.
test.describe('Seeded full profile', () => {
  test('an administrator sees every part of it', async ({ page }) => {
    const { _id } = getTestIds().profileStudent;
    await page.goto(`/academic/students/${_id}`);

    await expect(page.getByRole('heading', { name: 'Student12 Test' })).toBeVisible();
    await expect(page.getByText('9000000012').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'WhatsApp' }).first()).toHaveAttribute(
      'href',
      'https://wa.me/919000000012'
    );
    await expect(page.getByText('12 Station Road')).toBeVisible();
    await expect(page.getByText('B+', { exact: true })).toBeVisible();
    await expect(page.getByText('Carries an inhaler')).toBeVisible();
    await expect(page.getByText('St Mary High School')).toBeVisible();
    await expect(page.getByText('General', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed the final year')).toBeVisible();

    // The primary guardian has her own WhatsApp number; the emergency contact
    // reuses his phone.
    await expect(page.getByText('Meera Test')).toBeVisible();
    await expect(page.getByText('Primary', { exact: true })).toBeVisible();
    await expect(page.getByText('Anil Test')).toBeVisible();
    await expect(page.getByText('Emergency', { exact: true })).toBeVisible();
    await expect(page.locator('a[href="https://wa.me/919000000212"]')).toBeVisible();
    await expect(page.locator('a[href="https://wa.me/919000000312"]')).toBeVisible();

    await expect(page.getByText('XXXX XXXX 0124')).toBeVisible();
    await expect(page.getByText('234567890124')).toHaveCount(0);
  });
});

test.describe('Seeded full profile, read-only role', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('a teacher sees the profile but not the Aadhaar', async ({ page }) => {
    const { _id } = getTestIds().profileStudent;
    await page.goto(`/academic/students/${_id}`);
    await expect(page.getByRole('heading', { name: 'Student12 Test' })).toBeVisible();
    await expect(page.getByText('12 Station Road')).toBeVisible();
    await expect(page.getByText(/XXXX XXXX/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show full number' })).toHaveCount(0);
  });
});
