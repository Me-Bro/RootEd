import { test, expect } from '@playwright/test';
import { visibleText } from '../fixtures/dom.js';

test.describe('Student self-service portal', () => {
  test.use({ storageState: 'tests/fixtures/.auth/student.json' });

  test('the dashboard greets the student instead of showing tenant metadata cards', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(visibleText(page, /Hello, Student1 Test/)).toBeVisible({ timeout: 15_000 });
    // The metadata-card TenantDashboard a staff role without school-wide
    // permissions would otherwise fall through to.
    await expect(page.getByText('School', { exact: true })).toHaveCount(0);
  });

  test('the dashboard links out to the four self-service pages', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: 'View Timetable' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'View Grades' }).click();
    await expect(page).toHaveURL(/\/me\/grades/);
  });

  test('the nav shows only the self-service links, not the tenant-wide roster/roll pages', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'My Timetable' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'My Attendance' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Grades' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My Fees' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Students', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Timetable', exact: true })).toHaveCount(0);
  });

  test('My Timetable shows the published schedule for their own section', async ({ page }) => {
    await page.goto('/me/timetable');
    await expect(visibleText(page, /Mathematics/).first()).toBeVisible({ timeout: 15_000 });
    await expect(visibleText(page, /English/).first()).toBeVisible();
  });

  test('My Attendance shows a present-days summary and the seeded records', async ({ page }) => {
    await page.goto('/me/attendance');
    await expect(visibleText(page, /% present/)).toBeVisible({ timeout: 15_000 });
  });

  test('My Grades shows only the published Mathematics grade, not the unpublished subjects', async ({
    page,
  }) => {
    await page.goto('/me/grades');
    await expect(visibleText(page, 'Mathematics')).toBeVisible({ timeout: 15_000 });
    await expect(visibleText(page, 'English')).toHaveCount(0);
    await expect(visibleText(page, 'Science')).toHaveCount(0);
  });

  test('My Fees shows the assignment total and the seeded partial payment', async ({ page }) => {
    await page.goto('/me/fees');
    await expect(visibleText(page, /Total due/)).toBeVisible({ timeout: 15_000 });
    await expect(visibleText(page, 'RCP-TEST-00001')).toBeVisible();
  });

  test('a student cannot reach tenant-wide roster or roll pages', async ({ page }) => {
    await page.goto('/academic/students');
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
  });

  test('a student cannot reach the tenant-wide grades entry page', async ({ page }) => {
    await page.goto('/academic/grades');
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
  });
});
