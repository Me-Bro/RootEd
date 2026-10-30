import { test, expect } from '@playwright/test';
import { AUTH_STATES, TEST_USERS } from './fixtures/auth.js';
import { authHeader } from './fixtures/seed.js';

test.describe('trainer scores assignments', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('lists the batch assignments with their progress', async ({ page }) => {
    await page.goto('/assignments');
    const row = page.getByTestId('assignment-Seed: Git basics');
    await expect(row).toBeVisible();
    await expect(row).toContainText('2 reviewed');
    await expect(row).toContainText('1 submitted');
    await expect(page.getByTestId('assignment-Seed: REST API')).toContainText('0 reviewed');
  });

  test('opens the scoring grid with each student result', async ({ page }) => {
    await page.goto('/assignments');
    await page.getByRole('button', { name: 'Score Seed: Git basics' }).click();
    const grid = page.getByTestId('scoring-grid');
    await expect(grid).toBeVisible();
    // Seeded: Student1 reviewed 8, Student2 reviewed 6, Student3 submitted.
    await expect(page.getByLabel('Score for Student1 Test')).toHaveValue('8');
    await expect(page.getByLabel('Score for Student2 Test')).toHaveValue('6');
    await expect(page.getByLabel('Status for Student3 Test')).toHaveValue('submitted');
  });

  test('creates an assignment, scores a student, and refuses a score above the maximum', async ({
    page,
    request,
  }) => {
    const title = `E2E assignment ${Date.now()}`;
    await page.goto('/assignments');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Due date').fill('2025-07-30');
    await page.getByLabel('Out of').fill('10');
    await page.getByRole('button', { name: 'Add assignment' }).click();

    const row = page.getByTestId(`assignment-${title}`);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: `Score ${title}` }).click();

    const name = 'Student4 Test';
    await page.getByLabel(`Status for ${name}`).selectOption('reviewed');
    await page.getByLabel(`Score for ${name}`).fill('99');
    await page.getByRole('button', { name: `Save result for ${name}` }).click();
    await expect(page.getByRole('alert')).toContainText(/exceeds/i);

    await page.getByLabel(`Score for ${name}`).fill('7');
    await page.getByLabel(`Feedback for ${name}`).fill('Good structure');
    await page.getByRole('button', { name: `Save result for ${name}` }).click();
    await expect(page.getByRole('button', { name: `Save result for ${name}` })).toHaveText('Saved');
    await expect(row).toContainText('1 reviewed');

    // Clean up so later specs see the seeded assignment totals.
    const headers = await authHeader(request, TEST_USERS.teacher);
    const list = await (await request.get('/__api/training/assignments', { headers })).json();
    for (const a of list.filter((x) => x.title === title)) {
      await request.delete(`/__api/training/assignments/${a._id}`, {
        headers: { ...headers, 'x-csrf-token': await csrf(request) },
      });
    }
  });
});

test.describe('the TPO can look but not change', () => {
  test.use({ storageState: AUTH_STATES.principal });

  test('sees assignments with no form and no save buttons', async ({ page }) => {
    await page.goto('/assignments');
    await expect(page.getByTestId('assignment-Seed: Git basics')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add assignment' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Score Seed: Git basics' }).click();
    await expect(page.getByTestId('scoring-grid')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save result for/ })).toHaveCount(0);
    await expect(page.getByLabel('Status for Student1 Test')).toBeDisabled();
  });
});

async function csrf(request) {
  const res = await request.get('/__api/csrf-token');
  return (await res.json()).csrfToken;
}
