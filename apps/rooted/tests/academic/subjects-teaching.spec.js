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

test.describe('Teachers dialog on the Subjects page', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('admin assigns one teacher to every section of a subject and clears it again', async ({
    page,
  }) => {
    await page.goto('/academic/subjects');
    await page.getByTestId('subject-row-SCI5').getByRole('button', { name: 'Teachers' }).click();
    const dialog = page.getByRole('dialog');
    const sectionA = dialog.getByLabel('Teacher for Grade 5 - A');
    const sectionB = dialog.getByLabel('Teacher for Grade 5 - B');
    // The seed leaves Science unassigned.
    await expect(sectionA).toHaveValue('');
    await expect(sectionB).toHaveValue('');

    await dialog.getByLabel('Same teacher for all sections').selectOption({ label: 'Alice Smith' });
    await expect(sectionA).not.toHaveValue('');
    await expect(sectionB).not.toHaveValue('');
    const chosen = await sectionA.inputValue();
    expect(await sectionB.inputValue()).toBe(chosen);

    // It persists, and reads back as the year's teacher.
    await page.reload();
    await page.getByTestId('subject-row-SCI5').getByRole('button', { name: 'Teachers' }).click();
    await expect(page.getByRole('dialog').getByLabel('Teacher for Grade 5 - A')).toHaveValue(
      chosen
    );

    // clean up: unassign both sections
    const again = page.getByRole('dialog');
    await again.getByLabel('Teacher for Grade 5 - A').selectOption('');
    await expect(again.getByLabel('Teacher for Grade 5 - A')).toHaveValue('');
    await again.getByLabel('Teacher for Grade 5 - B').selectOption('');
    await expect(again.getByLabel('Teacher for Grade 5 - B')).toHaveValue('');
  });

  test('the old Teaching address lands on Subjects', async ({ page }) => {
    await page.goto('/academic/teaching');
    await expect(page).toHaveURL(/\/academic\/subjects$/);
    await expect(page.getByRole('heading', { name: 'Subjects' })).toBeVisible();
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
