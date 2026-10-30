import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

test.describe('readiness table', () => {
  test.use({ storageState: AUTH_STATES.principal });

  test('shows each student with the figures behind their score', async ({ page }) => {
    await page.goto('/readiness');
    const s1 = page.getByTestId('readiness-2025-TEST-001');
    await expect(s1).toContainText('Completed');
    // Seeded: 5 present / 2 absent → 71.4%; 8 of 40 assignment marks → 20%;
    // Maths final 78 / baseline 63 → +15; project 82; mock 75; joined an employer.
    await expect(s1).toContainText('71.4%');
    await expect(s1).toContainText('20%');
    await expect(s1).toContainText('82');
    await expect(s1).toContainText('75');
    await expect(s1).toContainText('Joined');
  });

  test('labels the score as indicative, because the formula is provisional', async ({ page }) => {
    await page.goto('/readiness');
    await expect(page.getByText(/indicative/i).first()).toBeVisible();
    const s1 = page.getByTestId('readiness-2025-TEST-001');
    await expect(s1.getByText('Indicative', { exact: true })).toBeVisible();
    const score = await s1.getByTestId('readiness-score').innerText();
    expect(Number(score)).toBeGreaterThan(0);
    expect(Number(score)).toBeLessThanOrEqual(100);
  });

  test('shows a dash where nothing is recorded, not a zero', async ({ page }) => {
    await page.goto('/readiness');
    // Student9 has no project review, mock interview or placement.
    const s9 = page.getByTestId('readiness-2025-TEST-009');
    await expect(s9).toContainText('—');
    await expect(s9.getByText('Left the programme')).toHaveCount(0);
  });

  test('includes the student who left, marked as such', async ({ page }) => {
    await page.goto('/readiness');
    await expect(page.getByTestId('readiness-2025-TEST-010')).toContainText('Left the programme');
  });
});
