import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

const PROJECT = 'project-Seed: Team 1 project';

test.describe('trainer manages the team project', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('shows the team, repository, milestones and review', async ({ page }) => {
    await page.goto('/projects');
    const card = page.getByTestId(PROJECT);
    await expect(card).toContainText('Reviewed: 82/100');
    await expect(card).toContainText('Student1 Test, Student2 Test, Student3 Test');
    await expect(card.getByRole('link', { name: /seed-team-1/ })).toHaveAttribute(
      'href',
      'https://github.com/rrcloud/seed-team-1'
    );
    await expect(card.getByRole('checkbox', { name: 'Auth done' })).toBeChecked();
    await expect(card.getByRole('checkbox', { name: 'Deployed' })).not.toBeChecked();
  });

  test('ticks a milestone off and adds another', async ({ page }) => {
    await page.goto('/projects');
    const card = page.getByTestId(PROJECT);

    // The box follows the saved value, so it ticks once the server has answered.
    await card.getByRole('checkbox', { name: 'Deployed' }).click();
    await expect(card.getByRole('checkbox', { name: 'Deployed' })).toBeChecked();

    await card.getByLabel('Add a milestone').fill('Final demo');
    await card.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(card.getByRole('checkbox', { name: 'Final demo' })).not.toBeChecked();

    // The change is saved, not just shown.
    await page.reload();
    await expect(
      page.getByTestId(PROJECT).getByRole('checkbox', { name: 'Deployed' })
    ).toBeChecked();
    await expect(
      page.getByTestId(PROJECT).getByRole('checkbox', { name: 'Final demo' })
    ).toBeVisible();
  });

  test('updates the review score and notes', async ({ page }) => {
    await page.goto('/projects');
    const card = page.getByTestId(PROJECT);
    await card.getByLabel('Review score (0–100)').fill('88');
    await card.getByLabel('Review notes').fill('Clean demo, tidy repo');
    await card.getByRole('button', { name: 'Save review' }).click();
    await expect(card).toContainText('Reviewed: 88/100');

    // Put the seeded review back: later specs assert the seeded project score.
    await card.getByLabel('Review score (0–100)').fill('82');
    await card.getByLabel('Review notes').fill('Seed review');
    await card.getByRole('button', { name: 'Save review' }).click();
    await expect(card).toContainText('Reviewed: 82/100');
  });

  test('creates a project from the batch roster', async ({ page }) => {
    await page.goto('/projects');
    await page.getByLabel('Project name').fill('E2E team project');
    await page.getByRole('checkbox', { name: 'Student7 Test' }).check();
    await page.getByRole('checkbox', { name: 'Student8 Test' }).check();
    await page.getByRole('button', { name: 'Add project' }).click();
    const created = page.getByTestId('project-E2E team project');
    await expect(created).toContainText('Student7 Test, Student8 Test');
    await expect(created).toContainText('Not reviewed yet');
  });
});

test.describe('the TPO can look but not change', () => {
  test.use({ storageState: AUTH_STATES.principal });

  test('sees the project without any editing controls', async ({ page }) => {
    await page.goto('/projects');
    const card = page.getByTestId(PROJECT);
    await expect(card).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add project' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Save review' })).toHaveCount(0);
    await expect(card.getByRole('checkbox', { name: 'Auth done' })).toBeDisabled();
  });
});
