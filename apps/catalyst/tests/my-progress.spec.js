import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

// The seeded student login is linked to Student1 Test. The seed publishes only
// the Mathematics final, so that is the only grade visible; the baseline and the
// mock interview exist but are not published, and Seed: REST API is unreviewed.
test.describe('a student sees their own progress', () => {
  test.use({ storageState: AUTH_STATES.student });

  test('shows attendance, the decision and the project review', async ({ page }) => {
    await page.goto('/me/progress');
    await expect(page.getByRole('heading', { level: 1, name: 'My progress' })).toBeVisible();
    await expect(page.getByTestId('my-status')).toHaveText('Completed');
    await expect(page.getByTestId('stat-attendance-value')).toHaveText('71.4%');
    await expect(page.getByTestId('stat-assignments-value')).toHaveText('20%');
    await expect(page.getByTestId('stat-project-value')).toHaveText('82');
    await expect(page.getByTestId('my-project')).toContainText('Seed: Team 1 project');
  });

  test('shows only published scores', async ({ page }) => {
    await page.goto('/me/progress');
    // Maths final 78 is published; baseline (63) and mock interview (75) are not.
    await expect(page.getByTestId('stat-final-value')).toHaveText('78');
    await expect(page.getByTestId('stat-improvement-value')).toHaveText('—');
    await expect(page.getByTestId('stat-mock-value')).toHaveText('—');
    const grades = page.getByRole('table').nth(1);
    await expect(grades.getByRole('row')).toHaveCount(2); // header + Mathematics final
    await expect(grades).toContainText('Final');
    await expect(grades).not.toContainText('Mock interview');
    await expect(grades).not.toContainText('Baseline');
  });

  test('shows a score only once it has been reviewed', async ({ page }) => {
    await page.goto('/me/progress');
    await expect(page.getByTestId('my-assignment-Seed: Git basics')).toContainText('8 / 10');
    // Assignments the trainer has not recorded show no score at all.
    await expect(
      page.getByTestId('my-assignment-Seed: REST API').getByTestId('my-assignment-score')
    ).toHaveText('—');
  });

  test('labels readiness as indicative', async ({ page }) => {
    await page.goto('/me/progress');
    const card = page.getByTestId('readiness-card');
    await expect(card.getByText('Indicative', { exact: true })).toBeVisible();
    await expect(card).toContainText('It is not a result');
  });

  test('shows placement without promising a job', async ({ page }) => {
    await page.goto('/me/progress');
    await expect(page.getByText('Seed: Acme Software')).toBeVisible();
    await expect(page.getByText('Joined').first()).toBeVisible();
    await expect(page.getByText('Employment is not guaranteed')).toBeVisible();
  });

  test('contains nobody else', async ({ page }) => {
    await page.goto('/me/progress');
    await expect(page.getByTestId('stat-attendance-value')).toBeVisible();
    const text = await page.locator('main').innerText();
    for (const other of ['Student2', 'Student3', '2025-TEST-002', '2025-TEST-003']) {
      expect(text).not.toContain(other);
    }
  });

  test('has no staff pages: asking for one returns to their own progress', async ({ page }) => {
    for (const path of ['/dashboard', '/completion', '/outcomes']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/me\/progress$/);
    }
  });
});
