import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { AUTH_STATES } from '../fixtures/auth.js';
import { createTestApiClient } from '../fixtures/data.js';

// Rebuilt per docs/mobile-ui/05-grades-approved.html: 4 raw selects + a plain
// table are replaced by chip pickers + a roster list driven by a docked
// keypad, so the old select-based coverage no longer applies.

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Ids are passed via URL query params rather than clicking through pickers —
// more robust, and matches how other rebuilt specs (e.g. attendance.spec.js)
// deep-link into a scope.
function scopedUrl({ section, term, subject, assessmentType }) {
  const params = new URLSearchParams({
    sectionId: section._id,
    termId: term._id,
    subjectId: subject._id,
  });
  if (assessmentType) params.set('assessmentType', assessmentType);
  return `/academic/grades?${params.toString()}`;
}

async function scopedGoto(page, scope) {
  await page.goto(scopedUrl(scope));
  await page.waitForLoadState('networkidle');
}

// The admission number is always rendered (as the row's secondary line, even
// while that row is focused/typing — see MarkRow.jsx) specifically so tests
// can find a specific student's row regardless of which row the docked
// keypad currently has focused.
function rowFor(page, student) {
  return page.getByRole('button').filter({ hasText: student.admissionNo });
}

test.describe('Grades page', () => {
  // Default e2e project storageState (super_admin) impersonates the seeded
  // testschool tenant (see auth.setup.js) — no override needed here.

  test('GET /academic/terms is scoped to the active academic year (regression: duplicate term options)', async ({
    page,
  }) => {
    const { section, term, subjects, academicYear } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');

    const termsRequest = page.waitForRequest((req) => req.url().includes('/academic/terms'));
    await scopedGoto(page, { section, term, subject: math });
    const req = await termsRequest;

    expect(new URL(req.url()).searchParams.get('yearId')).toBe(academicYear._id);
  });

  test('shows the seeded final score and letter grade for a graded student', async ({ page }) => {
    const { section, term, subjects, students, grades } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');
    const student = students.find((s) => s.status === 'active');
    const finalGrade = grades.find(
      (g) => g.studentId === student._id && g.subjectId === math._id && g.assessmentType === 'final'
    );

    await scopedGoto(page, { section, term, subject: math, assessmentType: 'final' });
    await expect(page.getByText(/entered/)).toBeVisible({ timeout: 10_000 });

    await expect(rowFor(page, student)).toContainText(String(finalGrade.score));
  });

  test('section/term/subject/assessment chip pickers reach a specific scope', async ({ page }) => {
    // Class/section/term names below are seed-test-data.js's fixed values
    // (only ids are exposed via .test-ids.json), so they're hardcoded
    // deliberately rather than looked up.
    const { subjects } = getTestIds();
    const science = subjects.find((s) => s.name === 'Science');

    await page.goto('/academic/grades');

    await page.getByRole('button', { name: 'Select section' }).click();
    await page.getByRole('menuitem', { name: 'Grade 5 - A' }).click();

    await page.getByRole('button', { name: 'Term' }).click();
    await page.getByRole('menuitem', { name: 'Term 1' }).click();

    await page.getByRole('button', { name: 'Subject' }).click();
    await page.getByRole('menuitem', { name: new RegExp(`^${science.name}`) }).click();

    await page.getByRole('button', { name: 'Final' }).click();
    await page.getByRole('menuitem', { name: 'Other' }).click();

    await expect(page.getByText(/entered/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Other' })).toBeVisible();
  });

  test('docked keypad enters a score, updates the live class average, and Next advances focus', async ({
    page,
  }) => {
    const { section, term, subjects } = getTestIds();
    const english = subjects.find((s) => s.name === 'English');

    // 'other' has no seeded grades for English — a guaranteed clean slate.
    await scopedGoto(page, { section, term, subject: english, assessmentType: 'other' });
    await expect(page.getByText(/^0 of \d+ entered$/)).toBeVisible({ timeout: 10_000 });

    const nextButton = page.getByRole('button', { name: /Next student/ });
    await expect(nextButton).toBeDisabled();

    await page.getByRole('button', { name: 'Digit 7' }).click();
    await page.getByRole('button', { name: 'Digit 5' }).click();
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await expect(page.getByText(/^1 of \d+ entered/)).toBeVisible();
    await expect(page.getByText(/class avg so far 75/)).toBeVisible();
  });

  test('AB marks a student absent for this assessment, advances, and is excluded from the average', async ({
    page,
  }) => {
    const { section, term, subjects } = getTestIds();
    const english = subjects.find((s) => s.name === 'English');

    await scopedGoto(page, { section, term, subject: english, assessmentType: 'other' });
    await expect(page.getByText(/^0 of \d+ entered$/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Mark absent' }).click();

    await expect(page.getByText(/^1 of \d+ entered$/)).toBeVisible();
    await expect(page.getByText('AB').first()).toBeVisible();
    await expect(page.getByText(/class avg so far/)).not.toBeVisible();
  });

  test('tapping a row jumps the docked keypad focus to it', async ({ page }) => {
    const { section, term, subjects, students } = getTestIds();
    const english = subjects.find((s) => s.name === 'English');
    const student = students.find((s) => s.status === 'active');

    await scopedGoto(page, { section, term, subject: english, assessmentType: 'other' });
    await expect(page.getByText(/entered/)).toBeVisible({ timeout: 10_000 });

    await rowFor(page, student).click();
    await expect(rowFor(page, student)).toContainText('typing…');
  });

  test('saves grades and shows success message', async ({ page }) => {
    const { section, term, subjects } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');

    await scopedGoto(page, { section, term, subject: math, assessmentType: 'other' });
    await expect(page.getByText(/entered/)).toBeVisible({ timeout: 10_000 });

    // Roster may already be fully marked from a previous run of this test —
    // only type a mark in if there's still an unmarked student to focus.
    const nextButton = page.getByRole('button', { name: /Next student/ });
    if (await nextButton.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Digit 8' }).click();
      await page.getByRole('button', { name: 'Digit 8' }).click();
      await nextButton.click();
    }

    await page.getByRole('button', { name: 'Save Grades' }).click();
    await expect(page.getByText('Grades saved')).toBeVisible({ timeout: 10_000 });
  });

  test('importing a CSV saves grades for matching admission numbers', async ({ page }) => {
    const { section, term, subjects, students } = getTestIds();
    const english = subjects.find((s) => s.name === 'English');
    const activeStudents = students.filter((s) => s.status === 'active').slice(0, 2);

    await scopedGoto(page, { section, term, subject: english, assessmentType: 'midterm' });
    await expect(page.getByText(/entered/)).toBeVisible({ timeout: 10_000 });

    const csv =
      'admissionNo,score\n' + activeStudents.map((s) => `${s.admissionNo},91`).join('\n') + '\n';

    await page.locator('input[type="file"]').setInputFiles({
      name: 'grades.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });

    await expect(page.getByText(/Imported \d+ grade/)).toBeVisible({ timeout: 10_000 });
    await expect(rowFor(page, activeStudents[0])).toContainText('91');
  });

  test.describe('lock/publish (teacher)', () => {
    test.use({ storageState: AUTH_STATES.teacher });

    test('teacher can lock grades, blocking further edits, then unlock', async ({ page }) => {
      const { section, term, subjects } = getTestIds();
      const science = subjects.find((s) => s.name === 'Science');

      await scopedGoto(page, { section, term, subject: science, assessmentType: 'midterm' });
      await expect(page.getByText(/entered/)).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: 'Lock Grades' }).click();
      await expect(page.getByText(/Grades are locked/)).toBeVisible({ timeout: 10_000 });
      // The sticky lock banner replaces the interactive keypad with a
      // disabled one, matching today's lock behaviour.
      await expect(page.getByRole('button', { name: 'Digit 1' })).toBeDisabled();

      await page.getByRole('button', { name: 'Unlock Grades' }).click();
      await expect(page.getByText(/Grades are locked/)).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByRole('button', { name: 'Digit 1' })).toBeEnabled();
    });
  });

  test('"View Report" link navigates to the grade report page', async ({ page }) => {
    const { section } = getTestIds();
    await page.goto(`/academic/grades?sectionId=${section._id}`);

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
