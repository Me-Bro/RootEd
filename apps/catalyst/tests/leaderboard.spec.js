import { test, expect } from '@playwright/test';
import { AUTH_STATES, TEST_USERS } from './fixtures/auth.js';
import { authHeader, seedIds } from './fixtures/seed.js';

// Seeded roadmap progress on the primary batch (4 items): Student2 finished 2
// (50%), Student3 finished 1 (25%), Student1 (the student login) none, and the
// dropped Student10 finished 1 but must not be listed. Nine students remain, so
// Student1 and Students 4-9 share the third rank.

async function studentApi(request, method, path, data) {
  const headers = await authHeader(request, TEST_USERS.student);
  const csrf = (await (await request.get('/__api/csrf-token')).json()).csrfToken;
  return request[method](`/__api${path}`, { headers: { ...headers, 'x-csrf-token': csrf }, data });
}

test.describe('a student sees the batch leaderboard, read only', () => {
  test.use({ storageState: AUTH_STATES.student });

  test('ranks classmates, marks the caller, and leaves out a dropped student', async ({ page }) => {
    await page.goto('/me/leaderboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Batch leaderboard' })).toBeVisible();

    const first = page.getByTestId('board-Student2 Test');
    await expect(first).toContainText('1');
    await expect(first).toContainText('2 / 4');
    await expect(first).toContainText('50%');
    await expect(page.getByTestId('board-Student3 Test')).toContainText('25%');

    const me = page.getByTestId('board-Student1 Test');
    await expect(me).toHaveAttribute('aria-current', 'true');
    await expect(me).toContainText('You');
    await expect(me).toContainText('0%');
    await expect(page.getByTestId('board-Student10 Test')).toHaveCount(0);
    await expect(page.getByRole('row')).toHaveCount(10); // header + nine students
  });

  test('has no controls: it is for looking only', async ({ page }) => {
    await page.goto('/me/leaderboard');
    await expect(page.getByTestId('board-Student2 Test')).toBeVisible();
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('textbox')).toHaveCount(0);
  });
});

test.describe('a mentor reviews student progress and what they wrote', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('shows each student progress, and an answer a student wrote', async ({ page, request }) => {
    const [first] = seedIds().training.roadmap.items;
    const answer = `Mentor-only answer ${Date.now()}`;
    await studentApi(request, 'put', `/me/roadmap/items/${first._id}`, { answer });

    try {
      await page.goto('/roadmap');
      await page.getByRole('button', { name: 'Student progress' }).click();
      const table = page.getByTestId('roadmap-progress');
      await expect(table.getByTestId('progress-Student2 Test')).toContainText('2 / 4');
      await expect(table.getByTestId('progress-Student2 Test')).toContainText('50%');
      await expect(table.getByTestId('progress-Student10 Test')).toHaveCount(0);

      const row = table.getByTestId('progress-Student1 Test');
      await row.getByText('Answers and links').click();
      await expect(row).toContainText(answer);
    } finally {
      await studentApi(request, 'put', `/me/roadmap/items/${first._id}`, { answer: '' });
    }
  });

  test('a student never sees that answer on the leaderboard', async ({ browser, request }) => {
    const [first] = seedIds().training.roadmap.items;
    const answer = `Private answer ${Date.now()}`;
    await studentApi(request, 'put', `/me/roadmap/items/${first._id}`, { answer });
    const context = await browser.newContext({ storageState: AUTH_STATES.student });
    try {
      const page = await context.newPage();
      await page.goto('/me/leaderboard');
      await expect(page.getByTestId('board-Student2 Test')).toBeVisible();
      await expect(page.getByText(answer)).toHaveCount(0);
    } finally {
      await context.close();
      await studentApi(request, 'put', `/me/roadmap/items/${first._id}`, { answer: '' });
    }
  });
});

test.describe('the TPO can review progress too', () => {
  test.use({ storageState: AUTH_STATES.principal });

  test('sees the progress table', async ({ page }) => {
    await page.goto('/roadmap');
    await page.getByRole('button', { name: 'Student progress' }).click();
    await expect(page.getByTestId('progress-Student2 Test')).toContainText('50%');
  });
});
