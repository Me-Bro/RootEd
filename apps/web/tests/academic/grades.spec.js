import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { AUTH_STATES } from '../fixtures/auth.js';
import { createTestApiClient } from '../fixtures/data.js';

// Rebuilt per docs/mobile-ui/05-grades-approved.html: 4 raw selects + a plain
// table are replaced by chip pickers + a roster list driven by a docked
// keypad, so the old select-based coverage no longer applies.
//
// The docked keypad is now `md:hidden` — above that breakpoint entry is driven
// by useMarkEntryKeys off the real keyboard. This project runs at Desktop
// Chrome width, so the entry tests below type; the keypad keeps its own
// coverage via an explicit page.setViewportSize() test, matching how
// timetable.spec.js/my-schedule.spec.js cover their responsive swaps.
const PHONE_VIEWPORT = { width: 390, height: 844 };

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

// Ids are passed via URL query params rather than clicking through pickers —
// more robust, and matches how other rebuilt specs (e.g. attendance.spec.js)
// deep-link into a scope.
//
// Every test that asserts a clean "0 of N entered" slate owns its own
// (subject, assessmentType) pair. Six tests previously shared English + 'other'
// while three of them committed marks into it, so under fullyParallel whichever
// writer won the race broke the others' precondition — a different test failed
// each run, which read as flakiness rather than as shared state.
function scopedUrl({ section, term, subject, assessmentType }) {
  const params = new URLSearchParams({
    sectionId: section._id,
    termId: term._id,
    subjectId: subject._id,
  });
  if (assessmentType) params.set('assessmentType', assessmentType);
  return `/academic/grades?${params.toString()}`;
}

// GradesPage seeds its scoreMap and its focused row from GET /academic/grades,
// and until that lands it renders a complete-looking '0 of N entered' off an
// empty map. Anything typed in that window is wiped when the seed effect
// finally runs, leaving exactly the state a clean slate has — which is why the
// failure read as 'the keystrokes were dropped'. 'networkidle' does not close
// the window: under a loaded full-suite run the browser can sit idle for the
// 500ms threshold while it parses Vite's module graph, before React has fired
// the query at all.
async function scopedGoto(page, scope) {
  const roster = page.waitForResponse(
    (res) => res.request().method() === 'GET' && /\/academic\/grades\?/.test(res.url())
  );
  await page.goto(scopedUrl(scope));
  await roster;
  await page.waitForLoadState('networkidle');
}

// focusedId is only ever set by that seed effect (or by a click), so a row in
// the 'typing…' state is proof the roster finished seeding and keystrokes will
// survive. Every test that types waits on this first.
function focusedRow(page) {
  return page.getByRole('button').filter({ hasText: 'typing…' });
}

async function waitForSeededRoster(page) {
  await expect(focusedRow(page)).toBeVisible({ timeout: 10_000 });
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

  test('typing a score and pressing Enter commits it and updates the live class average', async ({
    page,
  }) => {
    const { section, term, subjects } = getTestIds();
    const english = subjects.find((s) => s.name === 'English');

    // 'other' has no seeded grades for English — a guaranteed clean slate.
    await scopedGoto(page, { section, term, subject: english, assessmentType: 'other' });
    await expect(page.getByText(/^0 of \d+ entered$/)).toBeVisible({ timeout: 10_000 });
    await waitForSeededRoster(page);

    // No on-screen keypad at desktop width — the hint strip stands in for it.
    await expect(page.getByRole('button', { name: 'Digit 7' })).toBeHidden();
    await expect(page.getByText(/Type a mark/)).toBeVisible();

    await page.keyboard.press('7');
    await page.keyboard.press('5');
    await page.keyboard.press('Enter');

    await expect(page.getByText(/^1 of \d+ entered/)).toBeVisible();
    await expect(page.getByText(/class avg so far 75/)).toBeVisible();
  });

  test('Backspace deletes a digit and Escape clears the whole draft', async ({ page }) => {
    const { section, term, subjects } = getTestIds();
    const english = subjects.find((s) => s.name === 'English');

    // Own scope: asserts an empty slate both before and after.
    await scopedGoto(page, { section, term, subject: english, assessmentType: 'quiz' });
    await expect(page.getByText(/^0 of \d+ entered$/)).toBeVisible({ timeout: 10_000 });
    await waitForSeededRoster(page);

    const typingRow = focusedRow(page);

    await page.keyboard.press('9');
    await page.keyboard.press('4');
    await expect(typingRow).toContainText('94');

    await page.keyboard.press('Backspace');
    await expect(typingRow).toContainText('9');
    await expect(typingRow).not.toContainText('94');

    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    // Enter on an empty draft is a no-op — nothing was committed.
    await expect(page.getByText(/^0 of \d+ entered$/)).toBeVisible();
  });

  test('arrow keys move the focused row and wrap back to where they started', async ({ page }) => {
    const { section, term, subjects, students } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');
    const roster = students.filter((s) => s.status === 'active');
    test.skip(roster.length < 2, 'needs at least two active students in the section');

    await scopedGoto(page, { section, term, subject: math, assessmentType: 'midterm' });
    await expect(page.getByText(/entered/)).toBeVisible({ timeout: 10_000 });

    // Focus is established by clicking, not inherited from whichever row the
    // page happens to auto-focus. That auto-focus only lands on an ungraded
    // row, so a scope another spec had written to left nothing in draft state
    // and this timed out waiting for 'typing…'.
    const firstRow = page.getByRole('button').filter({ hasText: roster[0].admissionNo });
    await firstRow.click();

    // ArrowDown then ArrowUp must return to wherever it started.
    const typingRow = focusedRow(page);
    await expect(typingRow).toBeVisible({ timeout: 10_000 });
    const firstFocused = await typingRow.textContent();

    await page.keyboard.press('ArrowDown');
    await expect(typingRow).not.toHaveText(firstFocused);

    await page.keyboard.press('ArrowUp');
    await expect(typingRow).toHaveText(firstFocused);
  });

  test('the docked keypad still drives entry on a phone-width viewport', async ({ page }) => {
    const { section, term, subjects } = getTestIds();
    const science = subjects.find((s) => s.name === 'Science');

    await page.setViewportSize(PHONE_VIEWPORT);
    // Own scope: this commits a mark.
    await scopedGoto(page, { section, term, subject: science, assessmentType: 'other' });
    await expect(page.getByText(/^0 of \d+ entered$/)).toBeVisible({ timeout: 10_000 });
    await waitForSeededRoster(page);

    const nextButton = page.getByRole('button', { name: /Next student/ });
    await expect(nextButton).toBeDisabled();

    await page.getByRole('button', { name: 'Digit 7' }).click();
    await page.getByRole('button', { name: 'Digit 5' }).click();
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await expect(page.getByText(/^1 of \d+ entered/)).toBeVisible();
    await expect(page.getByText(/class avg so far 75/)).toBeVisible();
  });

  test('pressing A marks a student absent, advances, and is excluded from the average', async ({
    page,
  }) => {
    const { section, term, subjects } = getTestIds();
    const science = subjects.find((s) => s.name === 'Science');

    // Own scope: this commits an absent mark.
    await scopedGoto(page, { section, term, subject: science, assessmentType: 'quiz' });
    await expect(page.getByText(/^0 of \d+ entered$/)).toBeVisible({ timeout: 10_000 });
    await waitForSeededRoster(page);

    await page.keyboard.press('a');

    await expect(page.getByText(/^1 of \d+ entered$/)).toBeVisible();
    await expect(page.getByText('AB').first()).toBeVisible();
    await expect(page.getByText(/class avg so far/)).not.toBeVisible();
  });

  test('tapping a row jumps the docked keypad focus to it', async ({ page }) => {
    const { section, term, subjects, students } = getTestIds();
    const science = subjects.find((s) => s.name === 'Science');
    const student = students.find((s) => s.status === 'active');

    // Read-only, and no test writes here: tapping focuses a row regardless of
    // what is already entered, so a seeded scope is fine.
    await scopedGoto(page, { section, term, subject: science, assessmentType: 'final' });
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
    const typingRow = focusedRow(page);
    if (await typingRow.isVisible().catch(() => false)) {
      await page.keyboard.press('8');
      await page.keyboard.press('8');
      await page.keyboard.press('Enter');
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

      const enteredBefore = await page.getByText(/of \d+ entered/).textContent();

      await page.getByRole('button', { name: 'Lock Grades' }).click();
      await expect(page.getByText(/Grades are locked/)).toBeVisible({ timeout: 10_000 });
      // Locking withdraws both entry paths: Save is disabled, the keyboard hint
      // is gone, and keystrokes no longer reach the roster.
      await expect(page.getByRole('button', { name: 'Save Grades' })).toBeDisabled();
      await expect(page.getByText(/Type a mark/)).toBeHidden();
      await page.keyboard.press('1');
      await page.keyboard.press('Enter');
      await expect(page.getByText(/of \d+ entered/)).toHaveText(enteredBefore);

      await page.getByRole('button', { name: 'Unlock Grades' }).click();
      await expect(page.getByText(/Grades are locked/)).toHaveCount(0, { timeout: 10_000 });
      await expect(page.getByText(/Type a mark/)).toBeVisible();
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
