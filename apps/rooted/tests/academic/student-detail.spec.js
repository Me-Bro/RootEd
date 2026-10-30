import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { createTestApiClient, createStudent } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Student detail/profile page', () => {
  test('shows profile with attendance %, grades, and fee balance', async ({ page }) => {
    const ids = getTestIds();
    // Student1 — seeded with a parent contact, attendance records, grades, and a partial fee payment.
    const studentId = ids.students[0]._id;

    await page.goto(`/academic/students/${studentId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Student1 Test' })).toBeVisible();
    await expect(page.getByText('Parent / Guardian Contacts')).toBeVisible();
    await expect(page.getByText('Parent One')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Attendance' })).toBeVisible();
    await expect(page.getByText(/% present/)).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole('heading', { name: 'Grades' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fees' })).toBeVisible();
    await expect(page.getByText(/Balance:/)).toBeVisible({ timeout: 10_000 });
  });

  test('edits student details and adds a parent contact', async ({ page, request }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    const student = await createStudent(client, { firstName: 'EditMe', lastName: 'Original' });

    await page.goto(`/academic/students/${student._id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Last Name').fill('Updated');
    await dialog.getByRole('button', { name: 'Add Contact' }).click();
    await dialog.getByLabel('Name', { exact: true }).fill('Guardian A');
    await dialog.getByLabel('Phone', { exact: true }).fill('9123456780');
    await dialog.getByLabel('Relation', { exact: true }).fill('mother');

    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });

    await expect(page.getByRole('heading', { name: 'EditMe Updated' })).toBeVisible();
    await expect(page.getByText('Guardian A')).toBeVisible();
  });

  test('changes status: withdraw then reactivate', async ({ page, request }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    const student = await createStudent(client, { firstName: 'StatusFlow' });

    await page.goto(`/academic/students/${student._id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Mark Withdrawn' }).click();
    let confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(confirmDialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('withdrawn', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Reactivate' }).click();
    confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(confirmDialog).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('active', { exact: true })).toBeVisible();
  });

  test.describe('permission gating', () => {
    test.use({ storageState: 'tests/fixtures/.auth/teacher.json' });

    test('teacher (no fees:read) sees attendance/grades but not fees', async ({ page }) => {
      const ids = getTestIds();
      const studentId = ids.students[0]._id;

      await page.goto(`/academic/students/${studentId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: 'Attendance' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Grades' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Fees' })).not.toBeVisible();
    });
  });
});
