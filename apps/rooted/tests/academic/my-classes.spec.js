import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { AUTH_STATES } from '../fixtures/auth.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Seeded: Alice (teacher@) teaches Mathematics, English and Science to Grade 5 - A
// through her timetable (Mathematics is also assigned), and is Grade 5 - B's class teacher.

test.describe('My classes as a teacher', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('the dashboard lists my classes and a card opens attendance on that section', async ({
    page,
  }) => {
    const { section } = getTestIds();

    await page.goto('/dashboard');
    const classes = page.getByTestId('my-classes');
    await expect(classes).toBeVisible();
    await expect(classes.getByText('Mathematics')).toBeVisible();
    await expect(classes.getByText('Class teacher')).toBeVisible();

    // Cards sort by section then subject, so the first one is Grade 5 - A.
    await classes.getByRole('link', { name: 'Attendance' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/academic/attendance\\?sectionId=${section._id}`));
    await expect(page.getByRole('button', { name: /Grade 5-A/ })).toBeVisible();
  });

  test('the My classes page shows the same cards', async ({ page }) => {
    await page.goto('/academic/my-classes');
    await expect(page.getByRole('heading', { name: 'My classes' })).toBeVisible();
    await expect(page.getByTestId('my-classes').getByText('Grade 5 - A').first()).toBeVisible();
  });

  test('the attendance picker lists my classes first and still offers every class', async ({
    page,
  }) => {
    await page.goto('/academic/attendance');
    await page.getByRole('button', { name: 'Select section' }).click();
    await expect(page.getByRole('menu').getByText('My classes')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Grade 5 - A' })).toHaveCount(1);
    await expect(page.getByRole('menuitem', { name: 'Grade 5 - B' })).toHaveCount(1);
  });
});

test.describe('My classes as an admin', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('an admin who teaches nothing sees the empty state, not an error', async ({ page }) => {
    await page.goto('/academic/my-classes');
    await expect(page.getByText('No classes yet')).toBeVisible();
  });
});
