import { test, expect } from '@playwright/test';

// Runs against the real seeded feedback (seed-test-feedback: ..., one of each
// status — see seed-test-data.js) via the actual GET/PATCH /admin/feedback
// endpoints — no mocking.
// Serial: "advancing status" mutates then reverts the same seeded row the
// other two tests read — fullyParallel would otherwise race them.
test.describe.configure({ mode: 'serial' });
test.describe('Feedback page', () => {
  test('lists seeded feedback with their status', async ({ page }) => {
    await page.goto('/feedback');
    await page.waitForLoadState('networkidle');

    const newRow = page.getByRole('row', { name: /anonymous contact-us inquiry/ });
    const inProgressRow = page.getByRole('row', {
      name: /in-app feedback from a logged-in teacher/,
    });
    const resolvedRow = page.getByRole('row', { name: /resolved bug report/ });

    await expect(newRow).toBeVisible();
    await expect(inProgressRow).toBeVisible();
    await expect(resolvedRow).toBeVisible();

    await expect(newRow.getByText('New', { exact: true })).toBeVisible();
    await expect(inProgressRow.getByText('In Progress', { exact: true })).toBeVisible();
    await expect(resolvedRow.getByText('Resolved', { exact: true })).toBeVisible();
  });

  test('advancing status persists across reload, then reverts', async ({ page }, testInfo) => {
    // The [e2e] and [mobile] projects both match this file and share the same
    // backend/seeded row — running this mutation under both races them
    // (mobile's read of "New" can land mid-mutation). [mobile] here exists for
    // responsive-layout coverage (see playwright.config.js), not to re-verify
    // this flow, so it's skipped there.
    test.skip(testInfo.project.name === 'mobile', 'covered by the e2e project');

    await page.goto('/feedback');
    const row = page.getByRole('row', { name: /anonymous contact-us inquiry/ });
    await row.waitFor();

    await row.getByLabel('Change status for Seed Visitor').click();
    await page.getByRole('option', { name: 'In Progress' }).click();
    await expect(row.getByText('In Progress', { exact: true })).toBeVisible();

    await page.reload();
    const reloadedRow = page.getByRole('row', { name: /anonymous contact-us inquiry/ });
    await expect(reloadedRow.getByText('In Progress', { exact: true })).toBeVisible();

    // Restore original state so a re-run of this spec (without a fresh
    // `seed:test:clean`) starts from the same fixture the first test asserts.
    await reloadedRow.getByLabel('Change status for Seed Visitor').click();
    await page.getByRole('option', { name: 'New', exact: true }).click();
    await expect(reloadedRow.getByText('New', { exact: true })).toBeVisible();
  });

  test('filtering by status hides feedback in other statuses', async ({ page }) => {
    await page.goto('/feedback');
    await page.waitForLoadState('networkidle');

    await page.getByLabel('Status', { exact: true }).click();
    await page.getByRole('option', { name: 'Resolved' }).click();

    await expect(page.getByRole('row', { name: /resolved bug report/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /anonymous contact-us inquiry/ })).toHaveCount(0);
  });
});
