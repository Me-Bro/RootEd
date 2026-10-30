import { test, expect } from '@playwright/test';
import { AUTH_STATES, TEST_USERS } from './fixtures/auth.js';
import { authHeader, expected, seedIds } from './fixtures/seed.js';

// Student5 has no Enrollment row, so is "in progress" until the administrator decides.
const ROW = 'completion-2025-TEST-005';
const NAME = 'Student5 Test';

test.describe('the college administrator decides completion', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test('records a decision only after a second click, and the figure follows', async ({ page }) => {
    const e = expected();
    await page.goto('/completion');
    const row = page.getByTestId(ROW);
    await expect(row.getByTestId('completion-status')).toHaveText('In progress');
    await expect(page.getByTestId('metric-completion-value')).toHaveText(`${e.completionPct}%`);

    await page.getByLabel(`Decision for ${NAME}`, { exact: true }).selectOption('completed');
    await page.getByLabel(`Notes for ${NAME}`, { exact: true }).fill('Met every target');
    await page.getByRole('button', { name: `Record decision for ${NAME}` }).click();

    // Nothing has changed yet: it asks first.
    await expect(row).toContainText('mark completed: Student5 Test?');
    await expect(row.getByTestId('completion-status')).toHaveText('In progress');

    await page.getByRole('button', { name: `Confirm decision for ${NAME}` }).click();
    await expect(row.getByTestId('completion-status')).toHaveText('Completed');
    await expect(row).toContainText('Met every target');
    // 3 of 10 enrolled now.
    await expect(page.getByTestId('metric-completion-value')).toHaveText('30%');
    await expect(page.getByTestId('metric-completion')).toContainText('3 of 10 enrolled completed');
  });

  test('decides for several selected students at once, after a second click', async ({ page }) => {
    await page.goto('/completion');
    const seven = page.getByTestId('completion-2025-TEST-007');
    const eight = page.getByTestId('completion-2025-TEST-008');
    await expect(seven.getByTestId('completion-status')).toHaveText('In progress');
    await expect(page.getByTestId('bulk-bar')).toHaveCount(0);

    await page.getByLabel('Select Student7 Test', { exact: true }).check();
    await page.getByLabel('Select Student8 Test', { exact: true }).check();
    await expect(page.getByTestId('bulk-count')).toHaveText('2 selected');

    await page.getByLabel('Decision for the selected students').selectOption('completed');
    await page.getByRole('button', { name: 'Record for selected' }).click();
    // Nothing changes until confirmed.
    await expect(page.getByTestId('bulk-bar')).toContainText('mark completed for 2 students?');
    await expect(seven.getByTestId('completion-status')).toHaveText('In progress');

    await page.getByRole('button', { name: 'Confirm for selected' }).click();
    await expect(seven.getByTestId('completion-status')).toHaveText('Completed');
    await expect(eight.getByTestId('completion-status')).toHaveText('Completed');
    await expect(page.getByTestId('bulk-bar')).toHaveCount(0);

    // Put them back so later specs see the seeded figures.
    await page.getByLabel('Select Student7 Test', { exact: true }).check();
    await page.getByLabel('Select Student8 Test', { exact: true }).check();
    await page.getByLabel('Decision for the selected students').selectOption('active');
    await page.getByRole('button', { name: 'Record for selected' }).click();
    await page.getByRole('button', { name: 'Confirm for selected' }).click();
    await expect(seven.getByTestId('completion-status')).toHaveText('In progress');
    await expect(eight.getByTestId('completion-status')).toHaveText('In progress');
  });

  test('a search hides students from the selection, so they are never decided blind', async ({
    page,
  }) => {
    await page.goto('/completion');
    await page.getByLabel('Select Student7 Test', { exact: true }).check();
    await expect(page.getByTestId('bulk-count')).toHaveText('1 selected');
    await page.getByLabel('Search by name or admission no.').fill('Student9');
    await expect(page.getByTestId('bulk-bar')).toHaveCount(0);
    await page.getByLabel('Search by name or admission no.').fill('');
    await expect(page.getByTestId('bulk-count')).toHaveText('1 selected');
  });

  test('a read-only role gets no checkboxes', async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STATES.principal });
    const page = await context.newPage();
    await page.goto('/completion');
    await expect(page.getByTestId('completion-2025-TEST-007')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await context.close();
  });

  test('a decision can be cancelled before it is recorded', async ({ page }) => {
    await page.goto('/completion');
    const row = page.getByTestId('completion-2025-TEST-006');
    await page.getByLabel('Decision for Student6 Test', { exact: true }).selectOption('dropped');
    await page.getByRole('button', { name: 'Record decision for Student6 Test' }).click();
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(row.getByTestId('completion-status')).toHaveText('In progress');
  });

  test('a student who left counts against completion', async ({ page }) => {
    await page.goto('/completion');
    const row = page.getByTestId('completion-2025-TEST-010'); // seeded as dropped
    await expect(row.getByTestId('completion-status')).toHaveText('Left the programme');
    await expect(page.getByTestId('metric-completion')).toContainText('1 left');
  });

  test('can be reopened, which clears the end date and restores the figure', async ({ page }) => {
    const e = expected();
    await page.goto('/completion');
    const row = page.getByTestId(ROW);
    await expect(row.getByTestId('completion-status')).toHaveText('Completed');
    await page.getByLabel(`Decision for ${NAME}`, { exact: true }).selectOption('active');
    await page.getByRole('button', { name: `Record decision for ${NAME}` }).click();
    await page.getByRole('button', { name: `Confirm decision for ${NAME}` }).click();
    await expect(row.getByTestId('completion-status')).toHaveText('In progress');
    await expect(page.getByTestId('metric-completion-value')).toHaveText(`${e.completionPct}%`);
  });
});

for (const role of ['teacher', 'principal']) {
  test.describe(`${role} sees the statuses but cannot decide`, () => {
    test.use({ storageState: AUTH_STATES[role] });

    test('has no decision controls', async ({ page }) => {
      await page.goto('/completion');
      await expect(page.getByTestId('completion-2025-TEST-001')).toBeVisible();
      await expect(
        page.getByTestId('completion-2025-TEST-001').getByTestId('completion-status')
      ).toHaveText('Completed');
      await expect(page.getByRole('button', { name: /Record decision for/ })).toHaveCount(0);
      await expect(page.getByRole('columnheader', { name: 'Decision' })).toHaveCount(0);
    });

    test('is refused by the API as well, not just hidden', async ({ request }) => {
      const headers = await authHeader(request, TEST_USERS[role]);
      const { csrfToken } = await (await request.get('/__api/csrf-token')).json();
      const { sectionId } = expected();
      const student = seedIds().grades.find((g) => g.sectionId === sectionId).studentId;
      const res = await request.put('/__api/training/completion', {
        headers: { ...headers, 'x-csrf-token': csrfToken },
        data: { studentId: student, sectionId, status: 'completed' },
      });
      expect(res.status()).toBe(403);
    });
  });
}
