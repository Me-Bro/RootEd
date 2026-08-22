import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

test.describe('Grade report page', () => {
  // Default e2e project storageState (super_admin) now impersonates the
  // seeded testschool tenant (see auth.setup.js) — no override needed here.

  test('loads via deep link with sectionId, shows class average and distribution', async ({
    page,
  }) => {
    const { section, term, subjects } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');

    await page.goto(`/academic/grades/report?sectionId=${section._id}`);
    await page.locator('select').nth(1).selectOption(math._id);
    await page.locator('select').nth(2).selectOption(term._id);

    await expect(page.getByText(/Class average/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Grade distribution')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
  });

  test('filtering to a single assessment type narrows the report to that scope', async ({
    page,
  }) => {
    const { section, term, subjects, grades } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');

    await page.goto(`/academic/grades/report?sectionId=${section._id}`);
    await page.locator('select').nth(1).selectOption(math._id);
    await page.locator('select').nth(2).selectOption(term._id);
    await page.locator('table').waitFor({ timeout: 10_000 });

    await page.locator('select').nth(3).selectOption('quiz');
    await page.locator('table').waitFor({ timeout: 10_000 });

    const quizScores = grades
      .filter((g) => g.subjectId === math._id && g.assessmentType === 'quiz')
      .map((g) => g.score);
    const avg = Math.round((quizScores.reduce((a, b) => a + b, 0) / quizScores.length) * 100) / 100;

    // Scoped to the "Class average" stat, not the whole page — other specs'
    // timestamp-based admission numbers (e.g. UI-TEST-1787358408632) can
    // contain the average's digits as a substring, causing a strict-mode
    // violation on a page-wide getByText(String(avg)) match.
    const classAverage = page.locator('p', { hasText: 'Class average' });
    await expect(classAverage).toContainText(String(avg));
  });
});
