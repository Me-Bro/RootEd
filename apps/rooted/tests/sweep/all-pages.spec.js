/**
 * Full-app sweep: visits every authenticated route once and asserts it
 * renders without horizontal overflow or console/page errors. Runs against
 * both the `e2e` (desktop) and `mobile` Playwright projects (see
 * playwright.config.js) — same spec, different viewport per project.
 *
 * Uses the default super_admin storageState, which auth.setup.js already
 * impersonates into the seeded `testschool` tenant — that grants both the
 * super_admin-only routes (/tenants, /audit, /flags) and every tenant-module
 * permission (see requirePermission.js), so one identity covers every route
 * below without per-role logins.
 */
import { test } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import {
  trackConsoleErrors,
  assertNoErrors,
  assertNoHorizontalOverflow,
} from '../support/pageAudit.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

const ids = getTestIds();

const ROUTES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'tenants list', path: '/tenants' },
  { name: 'tenant detail', path: `/tenants/${ids.tenant._id}` },
  { name: 'audit log', path: '/audit' },
  { name: 'feature flags', path: '/flags' },
  { name: 'academic years', path: '/academic/years' },
  { name: 'students list', path: '/academic/students' },
  { name: 'student detail', path: `/academic/students/${ids.students[0]._id}` },
  { name: 'attendance', path: '/academic/attendance' },
  { name: 'attendance report', path: '/academic/attendance/report' },
  { name: 'grades', path: '/academic/grades' },
  { name: 'grade report', path: '/academic/grades/report' },
  { name: 'timetable', path: '/academic/timetable' },
  { name: 'my timetable', path: '/academic/my-timetable' },
  { name: 'report cards', path: '/academic/report-cards' },
  { name: 'staff list', path: '/staff' },
  { name: 'staff detail', path: `/staff/${ids.staffMembers[0]._id}` },
  { name: 'leave requests', path: '/staff/leaves' },
  { name: 'salary', path: '/staff/salary' },
  { name: 'salary structures', path: '/staff/salary-structures' },
  { name: 'expenses', path: '/expense' },
  { name: 'expense budgets', path: '/expense/budgets' },
  { name: 'fees', path: '/fee' },
  { name: 'fee structures', path: '/fee/structures' },
  { name: 'inventory', path: '/inventory' },
  { name: 'inventory depreciation', path: '/inventory/depreciation' },
  { name: 'setup wizard', path: '/setup' },
];

for (const route of ROUTES) {
  test(`${route.name} (${route.path}) renders without overflow or console errors`, async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);

    await page.goto(route.path);
    await page.waitForLoadState('networkidle');

    // Nothing should have bounced us to /login or /dashboard (permission/module
    // gate failing silently would otherwise show up only as a wrong-page pass).
    const url = new URL(page.url());
    if (route.path !== '/dashboard') {
      if (url.pathname === '/login' || url.pathname === '/dashboard') {
        throw new Error(`Expected to stay on ${route.path}, got redirected to ${url.pathname}`);
      }
    }

    await assertNoHorizontalOverflow(page);
    assertNoErrors(errors);
  });
}
