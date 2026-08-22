import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

const FIXTURE_DIR = path.join(import.meta.dirname, '../fixtures/files');

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Staff Directory', () => {
  test('loads staff list with seeded data, grouped by department', async ({ page }) => {
    await page.goto('/staff');
    await page.waitForLoadState('networkidle');

    // Scoped to <main>: the sidebar's own nav also has /staff/leaves, /staff/salary,
    // etc, which otherwise match this same prefix selector.
    const rows = page.locator('main a[href^="/staff/"]');
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test('opens Add Staff dialog', async ({ page }) => {
    await page.goto('/staff');
    await page.getByRole('button', { name: 'Add Staff' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Add Staff Member').first()).toBeVisible();
  });

  test('creates a staff member via the form', async ({ page }) => {
    const empId = `EMP-UI-${Date.now()}`;

    await page.goto('/staff');
    await page.getByRole('button', { name: 'Add Staff' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email').fill(`ui-test-${Date.now()}@testschool.local`);
    await dialog.getByLabel('First Name').fill('UITest');
    await dialog.getByLabel('Last Name').fill('Staff');
    await dialog.getByLabel('Employee ID').fill(empId);
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByRole('button', { name: 'Next' }).click();
    await dialog.getByRole('button', { name: 'Submit' }).click();

    await expect(dialog).not.toBeVisible({ timeout: 8_000 });

    // The new staff member lands in an "Unassigned" department bucket (no
    // department was set) — search for it directly instead of assuming
    // which section it renders under.
    await page.getByPlaceholder('Search by name or employee ID…').fill(empId);
    await expect(page.getByText(empId)).toBeVisible({ timeout: 10_000 });
  });

  test('shows a friendly error when the same email is added twice', async ({ page }) => {
    const email = `dupe-${Date.now()}@testschool.local`;

    async function addStaff(empId) {
      await page.getByRole('button', { name: 'Add Staff' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Email').fill(email);
      await dialog.getByLabel('First Name').fill('Dupe');
      await dialog.getByLabel('Last Name').fill('Staff');
      await dialog.getByLabel('Employee ID').fill(empId);
      await dialog.getByRole('button', { name: 'Next' }).click();
      await dialog.getByRole('button', { name: 'Next' }).click();
      await dialog.getByRole('button', { name: 'Submit' }).click();
      return dialog;
    }

    await page.goto('/staff');
    const firstDialog = await addStaff(`EMP-DUPE-A-${Date.now()}`);
    await expect(firstDialog).not.toBeVisible({ timeout: 8_000 });

    await page.waitForLoadState('networkidle');
    const secondDialog = await addStaff(`EMP-DUPE-B-${Date.now()}`);
    await expect(secondDialog.locator('.text-destructive')).toBeVisible({ timeout: 8_000 });
  });

  test('imports staff via valid CSV', async ({ page }) => {
    await page.goto('/staff');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import CSV' }).click(),
    ]);
    await fileChooser.setFiles(path.join(FIXTURE_DIR, 'staff-valid.csv'));

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Import Results')).toBeVisible();
    await expect(page.getByText(/Created:/)).toBeVisible();
  });

  test('CSV import reports errors for invalid rows', async ({ page }) => {
    await page.goto('/staff');

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Import CSV' }).click(),
    ]);
    await fileChooser.setFiles(path.join(FIXTURE_DIR, 'staff-malformed.csv'));

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Import Results')).toBeVisible();
    await expect(page.getByText(/Errors: [1-9]/)).toBeVisible();
  });

  test('groups staff by department instead of a flat table', async ({ page }) => {
    const ids = getTestIds();

    await page.goto('/staff');
    await page.waitForLoadState('networkidle');

    // Bob Jones (EMP-TEST-002) is seeded into the "Finance" department —
    // the department section heading should be visible with no filter
    // select needed, and his row should be visible under it.
    await expect(page.getByText(/^Finance/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(ids.staffMembers[1].employeeId)).toBeVisible();
  });

  test('surfaces on-leave staff in the on-leave-today strip', async ({ page }) => {
    const ids = getTestIds();

    await page.goto('/staff');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/On leave today/)).toBeVisible({ timeout: 10_000 });
    // The plain employee ID also matches this same person's row in the department
    // list below — the strip's chip is the only place it's prefixed with "· ".
    await expect(page.getByText(`· ${ids.staffOnLeave.employeeId}`)).toBeVisible();
  });

  test('search narrows results by employee ID', async ({ page }) => {
    const ids = getTestIds();

    await page.goto('/staff');
    await page.waitForLoadState('networkidle');

    await page
      .getByPlaceholder('Search by name or employee ID…')
      .fill(ids.staffMembers[0].employeeId);

    // Scoped to <main>: the sidebar's own nav also has /staff/leaves, /staff/salary,
    // etc, which otherwise match this same prefix selector.
    const rows = page.locator('main a[href^="/staff/"]');
    await expect(rows).toHaveCount(1, { timeout: 8_000 });
    await expect(page.getByText(ids.staffMembers[0].employeeId)).toBeVisible();
  });

  test('clicking a staff row navigates to the staff detail page', async ({ page }) => {
    const ids = getTestIds();

    await page.goto('/staff');
    await page.waitForLoadState('networkidle');
    await page
      .getByPlaceholder('Search by name or employee ID…')
      .fill(ids.staffWithDocs.employeeId);

    await page.getByRole('link', { name: 'Carla Diaz' }).click();
    await page.waitForURL(/\/staff\/[a-f0-9]+$/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /Carla Diaz/ })).toBeVisible();
  });

  test('detail page shows uploaded documents with a download action', async ({ page }) => {
    const ids = getTestIds();

    await page.goto(`/staff/${ids.staffWithDocs._id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('ID Proof.pdf')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
  });

  test('status transition updates the badge', async ({ page }) => {
    // Transitions the fixture forward then back to its original status so
    // this test stays order-independent from the on-leave-strip test above
    // (both share the `staffOnLeave` fixture, and specs may run in parallel).
    const ids = getTestIds();

    async function changeStatus(buttonLabel) {
      await page.getByRole('button', { name: buttonLabel }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Confirm' }).click();
      await expect(dialog).not.toBeVisible({ timeout: 8_000 });
    }

    await page.goto(`/staff/${ids.staffOnLeave._id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('on_leave', { exact: true })).toBeVisible({ timeout: 10_000 });

    await changeStatus('Mark Active');
    await expect(page.getByText('active', { exact: true })).toBeVisible({ timeout: 8_000 });

    await changeStatus('Mark On Leave');
    await expect(page.getByText('on_leave', { exact: true })).toBeVisible({ timeout: 8_000 });
  });
});
