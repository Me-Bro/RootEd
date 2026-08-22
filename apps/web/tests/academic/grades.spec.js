import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { AUTH_STATES } from '../fixtures/auth.js';
import { createTestApiClient } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

async function selectScope(page, { section, term, subject, assessment }) {
  await page.locator('select').nth(0).selectOption(section._id);
  await page.locator('select').nth(1).selectOption(term._id);
  await page.locator('select').nth(2).selectOption(subject._id);
  if (assessment) await page.locator('select').nth(3).selectOption(assessment);
}

// Other specs (e.g. students.spec.js's "creates a student via form") add
// students to this same seeded section while running in parallel, so a
// positional `.first()` row is not stable — always target a specific known
// student's row by admissionNo instead.
function rowFor(page, student) {
  return page.locator('tbody tr').filter({ hasText: student.admissionNo });
}

test.describe('Grades page', () => {
  // Default e2e project storageState (super_admin) now impersonates the
  // seeded testschool tenant (see auth.setup.js) — no override needed here.

  test.beforeEach(async ({ page }) => {
    await page.goto('/academic/grades');
    await page.waitForLoadState('networkidle');
  });

  test('renders section/term/subject/assessment controls', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Grades' })).toBeVisible();
    await expect(page.locator('select')).toHaveCount(4);
  });

  test('selecting section, term, subject loads students with seeded final scores', async ({
    page,
  }) => {
    const { section, term, subjects, students, grades } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');
    const student = students.find((s) => s.status === 'active');

    await selectScope(page, { section, term, subject: math });
    await page.locator('table').waitFor({ timeout: 10_000 });

    const finalGrade = grades.find(
      (g) => g.studentId === student._id && g.subjectId === math._id && g.assessmentType === 'final'
    );
    await expect(rowFor(page, student).locator('input[type="number"]')).toHaveValue(
      String(finalGrade.score)
    );
  });

  test('editing a score updates the letter grade live', async ({ page }) => {
    const { section, term, subjects, students } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');
    const student = students.find((s) => s.status === 'active');

    await selectScope(page, { section, term, subject: math });
    await page.locator('table').waitFor({ timeout: 10_000 });

    const row = rowFor(page, student);
    await row.locator('input[type="number"]').fill('95');
    await expect(row).toContainText('A');
  });

  test('switching assessment type loads a different set of scores (react-query key includes it)', async ({
    page,
  }) => {
    const { section, term, subjects, students, grades } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');
    const student = students.find((s) => s.status === 'active');

    await selectScope(page, { section, term, subject: math, assessment: 'final' });
    await page.locator('table').waitFor({ timeout: 10_000 });
    const finalScore = grades.find(
      (g) => g.studentId === student._id && g.subjectId === math._id && g.assessmentType === 'final'
    ).score;
    await expect(rowFor(page, student).locator('input[type="number"]')).toHaveValue(
      String(finalScore)
    );

    await page.locator('select').nth(3).selectOption('quiz');
    await page.locator('table').waitFor({ timeout: 10_000 });
    const quizScore = grades.find(
      (g) => g.studentId === student._id && g.subjectId === math._id && g.assessmentType === 'quiz'
    ).score;
    await expect(rowFor(page, student).locator('input[type="number"]')).toHaveValue(
      String(quizScore)
    );
    expect(quizScore).not.toBe(finalScore);
  });

  test('saves grades and shows success message', async ({ page }) => {
    const { section, term, subjects, students } = getTestIds();
    const science = subjects.find((s) => s.name === 'Science');
    const student = students.find((s) => s.status === 'active');

    await selectScope(page, { section, term, subject: science });
    await page.locator('table').waitFor({ timeout: 10_000 });

    await rowFor(page, student).locator('input[type="number"]').fill('88');
    await page.getByRole('button', { name: 'Save Grades' }).click();
    await expect(page.getByText('Grades saved')).toBeVisible({ timeout: 10_000 });
  });

  test('importing a CSV saves grades for matching admission numbers', async ({ page }) => {
    const { section, term, subjects, students } = getTestIds();
    const english = subjects.find((s) => s.name === 'English');
    const activeStudents = students.filter((s) => s.status === 'active').slice(0, 2);

    await selectScope(page, { section, term, subject: english, assessment: 'midterm' });
    await page.locator('table').waitFor({ timeout: 10_000 });

    const csv =
      'admissionNo,score\n' + activeStudents.map((s) => `${s.admissionNo},91`).join('\n') + '\n';

    await page.locator('input[type="file"]').setInputFiles({
      name: 'grades.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });

    await expect(page.getByText(/Imported \d+ grade/)).toBeVisible({ timeout: 10_000 });
    await expect(rowFor(page, activeStudents[0]).locator('input[type="number"]')).toHaveValue('91');
  });

  test.describe('lock/publish (teacher)', () => {
    test.use({ storageState: AUTH_STATES.teacher });

    test('teacher can lock grades, blocking further edits, then unlock', async ({ page }) => {
      const { section, term, subjects, students } = getTestIds();
      const science = subjects.find((s) => s.name === 'Science');
      const student = students.find((s) => s.status === 'active');

      await page.goto('/academic/grades');
      await selectScope(page, { section, term, subject: science, assessment: 'other' });
      await page.locator('table').waitFor({ timeout: 10_000 });

      await page.getByRole('button', { name: 'Lock Grades' }).click();
      await expect(page.getByText(/Grades are locked/)).toBeVisible({ timeout: 10_000 });
      await expect(rowFor(page, student).locator('input[type="number"]')).toBeDisabled();

      await page.getByRole('button', { name: 'Unlock Grades' }).click();
      await expect(page.getByText(/Grades are locked/)).toHaveCount(0, { timeout: 10_000 });
      await expect(rowFor(page, student).locator('input[type="number"]')).toBeEnabled();
    });
  });

  test('"View Report" link navigates to the grade report page', async ({ page }) => {
    const { section } = getTestIds();
    await page.locator('select').nth(0).selectOption(section._id);

    await page.getByRole('link', { name: 'View Report →' }).click();
    await expect(page).toHaveURL(/\/academic\/grades\/report/);
    await expect(page.getByRole('heading', { name: 'Grade Report' })).toBeVisible();
  });
});

test.describe('Report card status endpoint', () => {
  test('403s for a caller without grades:read', async ({ request }) => {
    const client = await createTestApiClient(request, 'viewer');
    const res = await client.get('/academic/report-card/status/000000000000000000000000');
    expect(res.status()).toBe(403);
  });
});
