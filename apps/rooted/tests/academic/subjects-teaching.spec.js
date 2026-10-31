import { test, expect } from '@playwright/test';
import { AUTH_STATES } from '../fixtures/auth.js';

// Subjects (add / edit / delete) and teacher assignment are admin-only writes.
// Every test cleans up after itself so the seeded MATH5/ENG5/SCI5 stay as the
// other academic specs expect them.

test.describe('Subjects page', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('admin adds, edits and deletes a subject', async ({ page }) => {
    const code = `E2E${Date.now() % 100000}`;
    await page.goto('/academic/subjects');
    await expect(page.getByRole('heading', { name: 'Subjects' })).toBeVisible();
    await expect(page.getByTestId('subject-row-MATH5')).toBeVisible();

    await page.getByRole('button', { name: 'Add subject' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Robotics');
    await dialog.getByLabel('Code').fill(code);
    await dialog.getByRole('button', { name: 'Save' }).click();
    const row = page.getByTestId(`subject-row-${code}`);
    await expect(row).toContainText('Robotics');

    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill('Robotics Lab');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(row).toContainText('Robotics Lab');

    page.once('dialog', (d) => d.accept());
    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(row).toHaveCount(0);
  });

  test('a duplicate code shows an error and a subject in use cannot be deleted', async ({
    page,
  }) => {
    await page.goto('/academic/subjects');
    await page.getByRole('button', { name: 'Add subject' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Maths again');
    await dialog.getByLabel('Code').fill('MATH5');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.locator('p.text-destructive')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    page.once('dialog', (d) => d.accept());
    await page.getByTestId('subject-row-MATH5').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('alert')).toContainText('in use');
    await expect(page.getByTestId('subject-row-MATH5')).toBeVisible();
  });
});

test.describe('Teaching page', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('admin assigns a teacher to a subject and it persists', async ({ page }) => {
    await page.goto('/academic/teaching');
    await expect(page.getByTestId('teaching-row-SCI5')).toHaveCount(0);

    await page.getByLabel('Section').click();
    await page.getByRole('option').first().click();
    await page.getByLabel('Term').click();
    await page.getByRole('option').first().click();

    const picker = page.getByLabel('Teacher for Science');
    await expect(picker).toBeVisible();
    await picker.selectOption({ index: 1 });
    await expect(picker).not.toHaveValue('');
    const chosen = await picker.inputValue();

    await page.reload();
    await page.getByLabel('Section').click();
    await page.getByRole('option').first().click();
    await page.getByLabel('Term').click();
    await page.getByRole('option').first().click();
    await expect(page.getByLabel('Teacher for Science')).toHaveValue(chosen);

    // clean up: unassign again
    await page.getByLabel('Teacher for Science').selectOption('');
    await expect(page.getByLabel('Teacher for Science')).toHaveValue('');
  });
});

test.describe('Subjects and teaching as a teacher', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('teacher sees subjects read-only and cannot open teaching', async ({ page }) => {
    await page.goto('/academic/subjects');
    await expect(page.getByTestId('subject-row-MATH5')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add subject' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    await page.goto('/academic/teaching');
    await expect(page.getByRole('heading', { name: 'Teaching' })).toHaveCount(0);
  });
});
