import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

test.describe('trainer tracks placement', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('lists employers and each application with its stage', async ({ page }) => {
    await page.goto('/placement');
    await expect(page.getByText('Seed: Acme Software', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('application-2025-TEST-001-Junior Developer')).toContainText(
      'Joined'
    );
    await expect(page.getByTestId('application-2025-TEST-003-Junior Developer')).toContainText(
      'Interviewed'
    );
    await expect(page.getByTestId('application-2025-TEST-005-Junior Developer')).toContainText(
      'Rejected'
    );
  });

  test('only offers the moves the pipeline allows, and never backwards (EH5)', async ({ page }) => {
    await page.goto('/placement');
    // Student3 is at "interviewed": the next stages are offered, joined, rejected, withdrawn.
    await expect(page.getByLabel('Move Student3 Test to').locator('option')).toHaveText([
      'Offered',
      'Joined',
      'Rejected',
      'Withdrawn',
    ]);
    // A finished application has no move control at all.
    await expect(page.getByLabel('Move Student1 Test to')).toHaveCount(0);
    await expect(page.getByLabel('Move Student5 Test to')).toHaveCount(0);
  });

  test('adds an application and moves it forward one stage at a time', async ({ page }) => {
    await page.goto('/placement');
    await page.getByLabel('Student', { exact: true }).selectOption({ label: 'Student6 Test' });
    await page
      .getByLabel('Employer', { exact: true })
      .selectOption({ label: 'Seed: Beta Systems' });
    await page.getByLabel('Role').fill('QA Intern');
    await page.getByRole('button', { name: 'Add application' }).click();

    const row = page.getByTestId('application-2025-TEST-006-QA Intern');
    await expect(row).toContainText('Applied');

    await page.getByLabel('Move Student6 Test to').selectOption('interviewed');
    await page.getByRole('button', { name: 'Move Student6 Test' }).click();
    await expect(row).toContainText('Interviewed');
    // Once interviewed, "Applied" and "Interviewed" are no longer on offer.
    await expect(page.getByLabel('Move Student6 Test to').locator('option')).toHaveText([
      'Offered',
      'Joined',
      'Rejected',
      'Withdrawn',
    ]);
  });

  test('the same application cannot be added twice', async ({ page }) => {
    await page.goto('/placement');
    await page.getByLabel('Student', { exact: true }).selectOption({ label: 'Student6 Test' });
    await page
      .getByLabel('Employer', { exact: true })
      .selectOption({ label: 'Seed: Beta Systems' });
    await page.getByLabel('Role').fill('QA Intern');
    await page.getByRole('button', { name: 'Add application' }).click();
    await expect(page.getByRole('alert').first()).toContainText(/already has an application/i);
  });

  test('records consent to share details', async ({ page }) => {
    await page.goto('/placement');
    const box = page.getByRole('checkbox', { name: 'Student2 Test' });
    await expect(page.getByRole('checkbox', { name: 'Student1 Test' })).toBeChecked(); // seeded
    await expect(box).not.toBeChecked();
    // The box follows the saved value, so it ticks once the server has answered.
    await box.click();
    await expect(box).toBeChecked();
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Student2 Test' })).toBeChecked();
  });
});

test.describe('the TPO can look but not change', () => {
  test.use({ storageState: AUTH_STATES.principal });

  test('sees applications with no move or add controls', async ({ page }) => {
    await page.goto('/placement');
    await expect(page.getByTestId('application-2025-TEST-001-Junior Developer')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add application' })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Student1 Test' })).toBeDisabled();
  });
});
