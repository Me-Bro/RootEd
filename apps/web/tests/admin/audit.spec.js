import { test, expect } from '@playwright/test';

// Runs against the real seeded audit logs (seed-test-audit.*, written directly
// to the AuditLog collection by seed-test-data.js — bypassing the async
// BullMQ audit worker so rows exist deterministically) via the actual
// GET /admin/audit endpoint — no mocking, the backend already existed and
// only the UI was placeholder.
// GET /admin/audit's `action` filter is an exact match (see admin.js), so
// filtering by one of the seed-test-audit.* actions always isolates exactly
// the seeded row regardless of how many real audit entries other e2e specs
// have generated in the meantime via genuine mutations (every spec run adds
// more, sorted newest-first — asserting against the *unfiltered* page 1
// would flake once enough of those pile up ahead of the seeded rows).
test.describe('Audit log page', () => {
  test('lists each seeded audit log entry when filtered by its action', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');

    for (const action of [
      'seed-test-audit.tenant.suspended',
      'seed-test-audit.flag.toggled',
      'seed-test-audit.student.created',
    ]) {
      await page.getByLabel('Action').fill(action);
      await expect(
        page.getByRole('row', { name: new RegExp(action.replace(/\./g, '\\.')) })
      ).toBeVisible();
    }
  });

  test('filtering by tenant hides logs scoped to a different/no tenant', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');

    // seed-test-audit.flag.toggled is a super-admin-scoped action (tenantId:
    // null) — combined with the tenant filter, it should disappear since the
    // backend ANDs both filters together.
    await page.getByLabel('Action').fill('seed-test-audit.flag.toggled');
    await expect(page.getByRole('row', { name: /seed-test-audit\.flag\.toggled/ })).toBeVisible();

    await page.getByLabel('Tenant').click();
    await page.getByRole('option', { name: 'Test School', exact: false }).click();
    await expect(page.getByRole('row', { name: /seed-test-audit\.flag\.toggled/ })).toHaveCount(0);

    // seed-test-audit.tenant.suspended IS scoped to Test School — should
    // remain visible with the same tenant filter still applied.
    await page.getByLabel('Action').fill('seed-test-audit.tenant.suspended');
    await expect(
      page.getByRole('row', { name: /seed-test-audit\.tenant\.suspended/ })
    ).toBeVisible();
  });
});
