import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { AUTH_STATES } from './fixtures/auth.js';

const scan = async (page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

const describeViolations = (violations) =>
  violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`
  );

test.describe('accessibility', () => {
  test.describe('public landing page', () => {
    test('has no violations on a desktop screen', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(describeViolations((await scan(page)).violations)).toEqual([]);
    });

    test('has no violations on a phone screen', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(describeViolations((await scan(page)).violations)).toEqual([]);
    });

    test('has no violations with the form errors and an open question showing', async ({
      page,
    }) => {
      await page.goto('/');
      await page.getByText('Do you guarantee jobs?').click();
      await page.getByRole('button', { name: 'Send request' }).click();
      await expect(page.getByText('Enter your name')).toBeVisible();
      expect(describeViolations((await scan(page)).violations)).toEqual([]);
    });
  });

  test.describe('platform enquiries', () => {
    test.use({ storageState: AUTH_STATES.super_admin });
    test('has no violations', async ({ page }) => {
      await page.goto('/enquiries');
      await expect(page.getByTestId('enquiry-Seed Degree College, Khatima')).toBeVisible();
      expect(describeViolations((await scan(page)).violations)).toEqual([]);
    });
  });

  test('sign-in page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(describeViolations((await scan(page)).violations)).toEqual([]);
  });

  test('forgot-password page', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
    expect(describeViolations((await scan(page)).violations)).toEqual([]);
  });

  test('reset-password page', async ({ page }) => {
    await page.goto('/reset-password?token=abc');
    await expect(page.getByRole('button', { name: 'Set password' })).toBeVisible();
    expect(describeViolations((await scan(page)).violations)).toEqual([]);
  });

  test.describe('trainer dashboard', () => {
    test.use({ storageState: AUTH_STATES.teacher });
    test('has no violations', async ({ page }) => {
      await page.goto('/dashboard');
      await expect(page.getByTestId('metric-attendance-value')).toBeVisible();
      expect(describeViolations((await scan(page)).violations)).toEqual([]);
    });
  });

  test.describe('trainer pages', () => {
    test.use({ storageState: AUTH_STATES.tenant_admin });
    for (const [path, ready] of [
      ['/assignments', 'Seed: Git basics'],
      ['/roadmap', 'Seed: HTML basics'],
      ['/completion', 'Student1 Test'],
      ['/readiness', 'Student1 Test'],
    ]) {
      test(`${path} has no violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByText(ready).first()).toBeVisible();
        expect(describeViolations((await scan(page)).violations)).toEqual([]);
      });
    }
  });

  test.describe('roadmap builder', () => {
    test.use({ storageState: AUTH_STATES.tenant_admin });
    test('has no violations with the item form open', async ({ page }) => {
      await page.goto('/roadmap');
      await page.getByRole('button', { name: 'Add item' }).click();
      await page.getByLabel('Lock this item').check();
      await expect(page.getByTestId('item-form')).toContainText('Seed: HTML basics');
      expect(describeViolations((await scan(page)).violations)).toEqual([]);
    });
  });

  test.describe('student roadmap', () => {
    test.use({ storageState: AUTH_STATES.student });
    test('has no violations', async ({ page }) => {
      await page.goto('/me/roadmap');
      await expect(page.getByTestId('my-item-Seed: HTML basics')).toBeVisible();
      expect(describeViolations((await scan(page)).violations)).toEqual([]);
    });
  });

  test.describe('student leaderboard', () => {
    test.use({ storageState: AUTH_STATES.student });
    test('has no violations', async ({ page }) => {
      await page.goto('/me/leaderboard');
      await expect(page.getByTestId('board-Student2 Test')).toBeVisible();
      expect(describeViolations((await scan(page)).violations)).toEqual([]);
    });
  });

  test.describe('mentor progress review', () => {
    test.use({ storageState: AUTH_STATES.teacher });
    test('has no violations', async ({ page }) => {
      await page.goto('/roadmap');
      await page.getByRole('button', { name: 'Student progress' }).click();
      await expect(page.getByTestId('progress-Student2 Test')).toBeVisible();
      expect(describeViolations((await scan(page)).violations)).toEqual([]);
    });
  });

  test.describe('student progress', () => {
    test.use({ storageState: AUTH_STATES.student });
    test('has no violations', async ({ page }) => {
      await page.goto('/me/progress');
      await expect(page.getByTestId('stat-attendance-value')).toBeVisible();
      expect(describeViolations((await scan(page)).violations)).toEqual([]);
    });
  });
});
