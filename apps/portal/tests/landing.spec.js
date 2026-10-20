import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

test.describe('the public landing page', () => {
  test('anyone can read it without signing in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'From campus to career' })
    ).toBeVisible();
  });

  test('has one heading per section, in the order a reader needs them', async ({ page }) => {
    await page.goto('/');
    const headings = await page.getByRole('heading', { level: 2 }).allInnerTexts();
    expect(headings).toEqual([
      'Built for colleges',
      'How a programme runs',
      'Programmes',
      'Measured, not promised',
      'See progress as it happens',
      'Placement support',
      'Questions colleges ask',
      'Request a proposal',
    ]);
  });

  test('Sign in leads to the sign-in page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('Request a proposal jumps to the proposal section', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('main').getByRole('link', { name: 'Request a proposal' }).click();
    await expect(page).toHaveURL(/#request-proposal$/);
    await expect(page.getByRole('heading', { name: 'Request a proposal' })).toBeInViewport();
  });

  test('every header link lands on a section that exists', async ({ page }) => {
    await page.goto('/');
    const links = page.getByRole('navigation', { name: 'Page sections' }).getByRole('link');
    const hrefs = await links.evaluateAll((els) => els.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) await expect(page.locator(href)).toHaveCount(1);
  });

  test('shows the three programmes, with no price anywhere on the page', async ({ page }) => {
    await page.goto('/');
    for (const name of ['Skill Builder', 'Career Ready', 'Campus Career Partner']) {
      await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
    }
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/₹|\bINR\b|\bRs\.?\s?\d/);
  });

  test('states the pilot targets from the same numbers the portal measures against', async ({
    page,
  }) => {
    await page.goto('/');
    const outcomes = page.locator('#outcomes');
    await expect(outcomes.getByText('At least 80%', { exact: true })).toBeVisible(); // attendance
    await expect(outcomes.getByText('At least 85% of enrolled students')).toBeVisible();
    await expect(outcomes.getByText('At least 80% of enrolled students')).toBeVisible();
    await expect(outcomes.getByText('At least 80% of eligible participants')).toBeVisible();
  });

  test('never promises a job', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#placement')).toContainText('Employment is not guaranteed');
    await expect(page.getByRole('region', { name: 'Questions colleges ask' })).toContainText(
      'Employment is not guaranteed'
    );
  });

  test('answers a question when it is opened', async ({ page }) => {
    await page.goto('/');
    const answer = page.getByText('Classroom or lab access, internet and a named coordinator.');
    await expect(answer).toBeHidden();
    await page.getByText('What do you need from the college?').click();
    await expect(answer).toBeVisible();
  });

  test('shows the contact email, and no phone line until a number is set', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'info@ruralrootcloud.com' })).toBeVisible();
    await expect(page.getByText('Phone / WhatsApp')).toHaveCount(0);
  });

  test('has a title and description for search and link previews', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Career Catalyst/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /placement/);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
  });
});

test.describe('someone already signed in does not see the landing page', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('is sent to their dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test.describe('the app behind the landing page is still private', () => {
  test('an unsigned-in visitor asking for a page is sent to sign in, not to the landing page', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});
