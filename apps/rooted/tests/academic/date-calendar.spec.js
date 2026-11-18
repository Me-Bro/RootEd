import { test, expect } from '@playwright/test';
import { AUTH_STATES } from '../fixtures/auth.js';

// Date fields can be typed as DD-MM-YYYY or picked from a calendar.
test.use({ storageState: AUTH_STATES.tenant_admin });

async function openAddDialog(page) {
  await page.goto('/academic/students');
  await page.getByRole('button', { name: 'Add Student' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Date fields: calendar and typing', () => {
  test('date of birth opens a calendar and a picked day fills the field', async ({ page }) => {
    const dialog = await openAddDialog(page);
    const field = dialog.getByLabel('Date of birth');

    await dialog.getByRole('button', { name: 'Open calendar' }).first().click();
    await page.getByLabel('Year').selectOption('2012');
    await page.getByLabel('Month').selectOption('4'); // May
    await page.locator('[data-iso="2012-05-15"]').click();

    await expect(field).toHaveValue('15-05-2012');
  });

  test('typing still works and the calendar opens on the typed date', async ({ page }) => {
    const dialog = await openAddDialog(page);
    const field = dialog.getByLabel('Admission date');

    await field.fill('01042024');
    await expect(field).toHaveValue('01-04-2024');

    await dialog.getByRole('button', { name: 'Open calendar' }).last().click();
    await expect(page.locator('[data-iso="2024-04-01"]')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-iso="2024-04-01"]')).toBeHidden();
  });
});
