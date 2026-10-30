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

  test('loads via deep link, shows the average ring and distribution bars', async ({ page }) => {
    const { section, term, subjects } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');

    await page.goto(
      `/academic/grades/report?sectionId=${section._id}&subjectId=${math._id}&termId=${term._id}`
    );

    await expect(page.getByText('Class average')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('group', { name: /Grade distribution/ })).toBeVisible();
    await expect(page.getByText(/All students · \d+/)).toBeVisible();
  });

  test('tapping a distribution band filters the student list to that grade', async ({ page }) => {
    const { section, term, subjects } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');

    await page.goto(
      `/academic/grades/report?sectionId=${section._id}&subjectId=${math._id}&termId=${term._id}`
    );
    await expect(page.getByText(/All students · \d+/)).toBeVisible({ timeout: 10_000 });

    // Pick whichever band actually has scored students, rather than assuming
    // a fixed letter — real seed data distribution isn't guaranteed here.
    const bandButtons = page.getByRole('button', { name: /^Grade [A-F]:/ });
    const bandCount = await bandButtons.count();
    let targetLetter = null;
    let targetCount = 0;
    for (let i = 0; i < bandCount; i++) {
      const label = await bandButtons.nth(i).getAttribute('aria-label');
      const [, letter, countStr] = label.match(/^Grade ([A-F]): (\d+)/);
      if (Number(countStr) > 0) {
        targetLetter = letter;
        targetCount = Number(countStr);
        break;
      }
    }
    test.skip(!targetLetter, 'No scored students in any grade band for this report');

    const targetBand = page.getByRole('button', { name: new RegExp(`^Grade ${targetLetter}:`) });
    await targetBand.click();

    await expect(
      page.getByText(new RegExp(`^Grade ${targetLetter} · ${targetCount} student`))
    ).toBeVisible();
    await expect(page.locator('.divide-y > div')).toHaveCount(targetCount);

    // Tapping the active band again clears the filter.
    await targetBand.click();
    await expect(page.getByText(/All students · \d+/)).toBeVisible();
  });

  test('filtering to a single assessment type narrows the report to that scope', async ({
    page,
  }) => {
    const { section, term, subjects, grades } = getTestIds();
    const math = subjects.find((s) => s.name === 'Mathematics');

    await page.goto(
      `/academic/grades/report?sectionId=${section._id}&subjectId=${math._id}&termId=${term._id}`
    );
    await expect(page.getByText('Class average')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'All types' }).click();
    await page.getByRole('menuitem', { name: 'Quiz' }).click();

    const quizScores = grades
      .filter((g) => g.subjectId === math._id && g.assessmentType === 'quiz')
      .map((g) => g.score);
    const avg = Math.round((quizScores.reduce((a, b) => a + b, 0) / quizScores.length) * 100) / 100;

    // Scoped to the average-ring card's aria-label, not the whole page —
    // other specs' timestamp-based admission numbers (e.g. UI-TEST-1787358408632)
    // can contain the average's digits as a substring, causing a strict-mode
    // violation on a page-wide text match.
    const averageCard = page.locator('[aria-label^="Class average"]');
    await expect(averageCard).toHaveAttribute(
      'aria-label',
      new RegExp(`^Class average ${avg}(,|$)`)
    );
  });
});
