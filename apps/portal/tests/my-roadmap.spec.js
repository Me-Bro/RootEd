import { test, expect } from '@playwright/test';
import { AUTH_STATES, TEST_USERS } from './fixtures/auth.js';
import { authHeader, seedIds } from './fixtures/seed.js';

// The seeded student login is Student1, who starts with no roadmap progress.
// Seed roadmap: HTML basics (open, has a question) -> Build a landing page (locked)
// -> Deploy your page (assignment, locked), plus a mentor-held item and an
// unpublished draft roadmap the student must never see.
const BODY_LOCKED = 'Secret practical instructions';

test.describe('a student works through their roadmap', () => {
  test.use({ storageState: AUTH_STATES.student });

  // Put Student1 back to "nothing done" so later specs see the seeded figures.
  test.afterAll(async ({ request }) => {
    const headers = await authHeader(request, TEST_USERS.student);
    const csrf = (await (await request.get('/__api/csrf-token')).json()).csrfToken;
    for (const item of seedIds().training.roadmap.items) {
      await request.put(`/__api/me/roadmap/items/${item._id}`, {
        headers: { ...headers, 'x-csrf-token': csrf },
        data: { completed: false },
      });
    }
  });

  test('sees their batch roadmap, with locked items explained and their content withheld', async ({
    page,
  }) => {
    await page.goto('/me/roadmap');
    await expect(page.getByRole('heading', { level: 1, name: 'My roadmap' })).toBeVisible();
    await expect(page.getByTestId('my-roadmap-Seed: Full-stack roadmap')).toBeVisible();
    await expect(page.getByText('Seed: Draft')).toHaveCount(0);

    // Nothing is done yet, so the first open item is what to do next.
    await expect(page.getByTestId('next-up')).toHaveText('Next up: Seed: HTML basics');

    const open = page.getByTestId('my-item-Seed: HTML basics');
    await expect(open).toContainText('Week 1');
    await expect(open.getByLabel('What is semantic HTML?')).toBeVisible();

    const locked = page.getByTestId('my-item-Seed: Build a landing page');
    await expect(locked.getByTestId('locked-reason')).toHaveText(
      'Complete Seed: HTML basics to unlock this.'
    );
    await expect(page.getByText(BODY_LOCKED)).toHaveCount(0);
    await expect(locked.getByRole('button', { name: /^Complete / })).toBeDisabled();

    const held = page.getByTestId('my-item-Seed: Mentor-held review');
    await expect(held.getByTestId('locked-reason')).toHaveText(
      'Closed until the mentor unlocks it'
    );
  });

  test('completing an item unlocks the next, and an answer is kept', async ({ page }) => {
    await page.goto('/me/roadmap');
    const first = page.getByTestId('my-item-Seed: HTML basics');
    const tick = first.getByRole('button', { name: 'Complete Seed: HTML basics' });
    await expect(tick).toHaveAttribute('aria-pressed', 'false');
    await tick.click();
    await expect(tick).toHaveAttribute('aria-pressed', 'true');

    // One of the four items is done: the summary follows the tick.
    await expect(page.getByTestId('summary-pct')).toHaveText('25%');
    await expect(page.getByTestId('summary-count')).toHaveText('1 of 4 items complete');

    const next = page.getByTestId('my-item-Seed: Build a landing page');
    await expect(next.getByText(BODY_LOCKED)).toBeVisible();
    await expect(next.getByTestId('locked-reason')).toHaveCount(0);

    await first.getByLabel('What is semantic HTML?').fill('Tags that carry meaning');
    await first.getByRole('button', { name: 'Save' }).click();
    await page.reload();
    await expect(
      page.getByTestId('my-item-Seed: HTML basics').getByLabel('What is semantic HTML?')
    ).toHaveValue('Tags that carry meaning');
  });

  test('submits an assignment link and refuses one that is not http(s)', async ({ page }) => {
    await page.goto('/me/roadmap');
    // The ticks are toggles and the previous test may have left one on.
    for (const title of ['Seed: HTML basics', 'Seed: Build a landing page']) {
      const tick = page
        .getByTestId(`my-item-${title}`)
        .getByRole('button', { name: `Complete ${title}` });
      if ((await tick.getAttribute('aria-pressed')) === 'false') await tick.click();
      await expect(tick).toHaveAttribute('aria-pressed', 'true');
    }

    const assignment = page.getByTestId('my-item-Seed: Deploy your page');
    await expect(assignment.getByRole('link', { name: 'Open the resource' })).toHaveAttribute(
      'href',
      'https://example.com/deploy-guide'
    );

    await assignment.getByLabel('Assignment link').fill('javascript:alert(1)');
    await assignment.getByRole('button', { name: 'Save' }).click();
    await expect(assignment.getByRole('alert')).toBeVisible();

    await assignment.getByLabel('Assignment link').fill('https://github.com/student1/site');
    await assignment.getByRole('button', { name: 'Save' }).click();
    await page.reload();
    await expect(
      page.getByTestId('my-item-Seed: Deploy your page').getByLabel('Assignment link')
    ).toHaveValue('https://github.com/student1/site');
  });
});

test.describe('staff are not shown the student roadmap', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('the teacher is sent back to their dashboard', async ({ page }) => {
    await page.goto('/me/roadmap');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
