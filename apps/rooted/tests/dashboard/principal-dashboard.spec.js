import { test, expect } from '@playwright/test';
import { AUTH_STATES } from '../fixtures/auth.js';

// principal@testschool.local resolves to DEFAULT_ROLE_TEMPLATES.principal
// (Role.js) — every :read permission plus leave:approve/expense:approve —
// which is exactly the "holds all 4 school-wide read permissions" gate
// DashboardPage.jsx checks (see hasSchoolWideVisibility). This is the first
// spec to exercise the `principal` storageState built by auth.setup.js.
test.use({ storageState: AUTH_STATES.principal });

test.describe('Principal Dashboard', () => {
  test('shows the Smart Home layout, not the 4-card TenantDashboard fallback', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // The plain TenantDashboard fallback shows a "School" metadata card —
    // its absence, combined with the greeting, confirms PrincipalDashboard
    // rendered instead of the fallback a non-principal role would get.
    await expect(page.getByText(/Good morning/)).toBeVisible();
    await expect(page.getByText('Key numbers')).toBeVisible();
    await expect(page.getByText('School', { exact: true })).not.toBeVisible();
  });

  test('KPI cards resolve to real percentages, not the loading dash', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Attendance/fee/score/staff cards each render a "N.N%" value once their
    // query resolves — seed-test-data.js now provides recent attendance and
    // an overdue fee assignment specifically so these aren't stuck at "—".
    const attendanceCard = page.getByText('Attendance today').locator('..');
    await expect(attendanceCard.getByText(/%$/)).toBeVisible({ timeout: 10_000 });

    const feeCard = page.getByText('Fee collected').locator('..');
    await expect(feeCard.getByText(/%$/)).toBeVisible({ timeout: 10_000 });
  });

  test('attention strip surfaces the seeded fee defaulter and pending leave, tapping through to Finance', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // seed-test-data.js's fee assignment has a 2025-09-30 due date — long
    // past by any real test run — so getDefaulters() always finds it.
    const defaulterRow = page.getByRole('button').filter({ hasText: 'fee defaulter' });
    await expect(defaulterRow).toBeVisible({ timeout: 10_000 });

    await defaulterRow.click();
    await page.waitForURL('**/dashboard/finance');
    await expect(page.getByRole('heading', { name: 'Finance Summary' })).toBeVisible();
    // exact: true — a case-insensitive match also hits the sidebar's "Fee
    // Collection" nav link, which is a different element entirely.
    await expect(page.getByText('Fee collection', { exact: true })).toBeVisible();
  });

  test('pending leave row taps through to Staff Summary and lists the seeded request', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const leaveRow = page.getByRole('button').filter({ hasText: /leave approval/ });
    await expect(leaveRow).toBeVisible({ timeout: 10_000 });
    await leaveRow.click();

    await page.waitForURL('**/dashboard/staff');
    await expect(page.getByRole('heading', { name: 'Staff Summary' })).toBeVisible();
    // seed-test-data.js's pending request is for staffMembers[1] ("Bob
    // Jones") — the table populates staffId, so the name (not an ID) is
    // what actually renders on screen.
    await expect(page.getByRole('cell', { name: /Bob Jones/ })).toBeVisible({ timeout: 10_000 });
  });

  test('trend period toggle switches between 7D/30D charts and shows an honest notice for Year', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Attendance trend')).toBeVisible();
    await page.getByRole('tab', { name: '30D' }).click();
    await page.waitForLoadState('networkidle');
    // 30D buckets into weekly bars (labelled W1, W2, ...) instead of the
    // 7D view's day-of-month labels — confirms the toggle actually re-shaped
    // the chart, not just changed which tab looks active.
    await expect(page.getByText('W1', { exact: true })).toBeVisible({ timeout: 10_000 });

    // Year always shows the honest "not enough history" notice today — the
    // backend's trend endpoint only ever accepts days=7|30 (see
    // attendanceTrendQuerySchema), so this is never a network call to fail,
    // just a client-side branch.
    await page.getByRole('tab', { name: 'Year' }).click();
    await expect(page.getByText('Not enough history yet')).toBeVisible();
  });

  test('date picker rewinds attendance numbers but leaves the fee defaulter count untouched', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const defaulterRowBefore = page.getByRole('button').filter({ hasText: 'fee defaulter' });
    await expect(defaulterRowBefore).toBeVisible({ timeout: 10_000 });
    const countBefore = await defaulterRowBefore.locator('span').first().textContent();

    // A date well outside both the fixed-2025 and the rolling-recent seed
    // windows — attendance is genuinely empty here, exercising the "not
    // marked yet" (null pct, not a misleading 0%) path from the approved
    // spec's edge-case table.
    const farPastDate = new Date();
    farPastDate.setDate(farPastDate.getDate() - 90);
    await page.locator('input[type="date"]').fill(farPastDate.toISOString().slice(0, 10));
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Viewing a past day')).toBeVisible();
    await expect(page.getByText(/live queue/)).toBeVisible();

    // Fee defaulters is explicitly NOT re-queried by date (see
    // PrincipalDashboard's query keys — only attendance ones include
    // selectedDate) — same count before and after rewinding.
    const defaulterRowAfter = page.getByRole('button').filter({ hasText: 'fee defaulter' });
    await expect(defaulterRowAfter).toBeVisible();
    const countAfter = await defaulterRowAfter.locator('span').first().textContent();
    expect(countAfter).toBe(countBefore);

    await page.getByRole('button', { name: 'Back to today' }).click();
    await expect(page.getByText('Viewing a past day')).not.toBeVisible();
  });

  test('Academic Summary shows today’s attendance breakdown and grade distribution', async ({
    page,
  }) => {
    await page.goto('/dashboard/academic');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Academic Summary' })).toBeVisible();
    await expect(page.getByText('Present', { exact: true })).toBeVisible();
    await expect(page.getByText('Exam performance')).toBeVisible();
    await expect(page.getByText(/^A$/)).toBeVisible();
    await expect(page.getByText(/^F$/)).toBeVisible();
  });
});

// A role without all 4 school-wide read permissions must keep seeing the
// original TenantDashboard — the new branch is additive, not a replacement.
test.describe('Non-principal roles are unaffected', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('teacher still sees the plain TenantDashboard, not the Smart Home', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('School', { exact: true })).toBeVisible();
    await expect(page.getByText(/Good morning/)).not.toBeVisible();
  });
});
