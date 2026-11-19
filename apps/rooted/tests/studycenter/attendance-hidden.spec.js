import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// TICKET-009: a study center records presence as check-in and check-out, so the
// roll-call attendance module is hidden from its owners, desk and learners. Schools
// keep it (covered by tests/academic/attendance*.spec.js, which still run unchanged).

function memberId(key) {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8')).studyTenant.members[key]._id;
}

test.describe('the owner', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('has no Attendance pages in the sidebar, but has the Front desk', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: 'Front desk' }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Attendance', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Attendance report' })).toHaveCount(0);
  });

  test('the dashboard shows who is inside and today’s check-ins, and never asks for roll-call data', async ({
    page,
  }) => {
    const rollCall = [];
    page.on('request', (req) => {
      const url = req.url();
      if (/\/academic\/attendance(\/|\?|$)/.test(url)) rollCall.push(url);
    });
    await page.goto('/dashboard');
    await expect(page.getByText('Inside now').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Check-ins today').first()).toBeVisible();
    await expect(page.getByText('Attendance today')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(rollCall).toEqual([]);
  });

  test('a learner’s page has no Attendance card; the Visits tab is the record of presence', async ({
    page,
  }) => {
    await page.goto(`/academic/students/${memberId('studyMember1')}`);
    await expect(page.getByRole('heading', { name: /Member One/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('heading', { name: 'Attendance' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Visits' })).toBeVisible();
  });
});

test.describe('the front desk on a phone', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk, viewport: { width: 375, height: 800 } });

  test('has the Front desk in the bottom bar where the attendance shortcut was', async ({
    page,
  }) => {
    await page.goto('/desk');
    const bar = page.locator('nav.fixed');
    await expect(bar.getByRole('link', { name: 'Front desk' })).toBeVisible({ timeout: 15_000 });
    await expect(bar.getByRole('link', { name: /Attendance/ })).toHaveCount(0);
  });
});

test.describe('a member', () => {
  test.use({ storageState: STUDY_AUTH_STATES.member1 });

  test('has no My attendance in the menu or on the home page', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('study-seat-card')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'My attendance' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'View attendance' })).toHaveCount(0);
  });
});
