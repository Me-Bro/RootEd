import { test, expect } from '@playwright/test';
import { AUTH_STATES, TEST_USERS } from './fixtures/auth.js';
import { authHeader } from './fixtures/seed.js';

async function csrf(request) {
  const res = await request.get('/__api/csrf-token');
  return (await res.json()).csrfToken;
}

test.describe('trainer builds a roadmap', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('shows the seeded roadmap with its locks', async ({ page }) => {
    await page.goto('/roadmap');
    const editor = page.getByTestId('roadmap-editor');
    await expect(editor).toContainText('Seed: Full-stack roadmap');
    await expect(page.getByTestId('roadmap-state')).toHaveText('Published');
    await expect(page.getByTestId('item-Seed: HTML basics')).toContainText('Week 1');
    await expect(page.getByTestId('item-Seed: Build a landing page')).toContainText(
      'Opens after: Seed: HTML basics'
    );
    await expect(page.getByTestId('item-Seed: Mentor-held review')).toContainText(
      'Closed until the mentor unlocks it'
    );
  });

  test('creates a roadmap, adds a locked item, reorders and publishes it', async ({
    page,
    request,
  }) => {
    const title = `E2E roadmap ${Date.now()}`;
    await page.goto('/roadmap');
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Timeline').selectOption('daily');
    await page.getByRole('button', { name: 'Create roadmap' }).click();

    const editor = page.getByTestId('roadmap-editor');
    await expect(editor).toContainText(title);
    await expect(page.getByTestId('roadmap-state')).toHaveText('Draft');

    // First item: open, day 1.
    await editor.getByRole('button', { name: 'Add item' }).click();
    const form = page.getByTestId('item-form');
    await form.getByLabel('Title').fill('Read the guide');
    await form.getByLabel('Day number').fill('1');
    await form.getByRole('button', { name: 'Save item' }).click();
    await expect(page.getByTestId('item-Read the guide')).toContainText('Day 1');

    // Second item: locked until the first is done.
    await editor.getByRole('button', { name: 'Add item' }).click();
    await form.getByLabel('Type').selectOption('assignment');
    await form.getByLabel('Title').fill('Submit the project');
    await form.getByLabel('Day number').fill('2');
    await form.getByLabel('Lock this item').check();
    await form.getByLabel('Read the guide').check();
    await form.getByRole('button', { name: 'Save item' }).click();
    const locked = page.getByTestId('item-Submit the project');
    await expect(locked).toContainText('Opens after: Read the guide');
    await expect(locked).toContainText('Assignment');

    // A bad link is refused by the API and shown.
    await editor.getByRole('button', { name: 'Add item' }).click();
    await form.getByLabel('Title').fill('Bad link');
    await form.getByLabel('Day number').fill('3');
    await form.getByLabel('Resource link').fill('javascript:alert(1)');
    await form.getByRole('button', { name: 'Save item' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await form.getByRole('button', { name: 'Cancel' }).click();

    // Reorder: the locked item moves above the first.
    await page.getByRole('button', { name: 'Move Submit the project up' }).click();
    await expect(page.locator('[data-testid^="item-"]').first()).toHaveAttribute(
      'data-testid',
      'item-Submit the project'
    );

    await editor.getByRole('button', { name: 'Publish' }).click();
    await expect(page.getByTestId('roadmap-state')).toHaveText('Published');

    // Clean up so later specs see only the seeded roadmaps.
    const headers = await authHeader(request, TEST_USERS.teacher);
    const list = await (await request.get('/__api/training/roadmaps', { headers })).json();
    for (const r of list.filter((x) => x.title === title)) {
      await request.delete(`/__api/training/roadmaps/${r._id}`, {
        headers: { ...headers, 'x-csrf-token': await csrf(request) },
      });
    }
  });
});

test.describe('the TPO can look but not change', () => {
  test.use({ storageState: AUTH_STATES.principal });

  test('sees the roadmap with no builder controls', async ({ page }) => {
    await page.goto('/roadmap');
    await expect(page.getByTestId('item-Seed: HTML basics')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create roadmap' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add item' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Publish' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  });
});

test.describe('a student is kept out of the builder', () => {
  test.use({ storageState: AUTH_STATES.student });

  test('is sent to their own pages', async ({ page }) => {
    await page.goto('/roadmap');
    await expect(page).not.toHaveURL(/\/roadmap$/);
  });
});
