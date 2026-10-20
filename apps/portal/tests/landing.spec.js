import { test, expect } from '@playwright/test';
import { AUTH_STATES, TEST_USERS } from './fixtures/auth.js';
import { authHeader } from './fixtures/seed.js';

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
    expect(text).not.toMatch(/₹|\$|\bINR\b|\bRs\.?\s?\d|rupee|lakh/i);
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
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/guaranteed (job|placement)|100% placement|assured (job|placement)/i);
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

test.describe('requesting a proposal', () => {
  const fill = async (page, college) => {
    await page.goto('/');
    const form = page.getByRole('form', { name: 'Request a proposal' });
    await form.getByLabel('Your name').fill('Meena Joshi');
    await form.getByLabel('College or institute').fill(college);
    await form.getByLabel('Email', { exact: true }).fill('tpo@college.test');
    await form.getByLabel('Phone or WhatsApp number').fill('+91 98765 43210');
    await form.getByLabel('Programme you are interested in').selectOption('career_ready');
    return form;
  };

  test('a valid request is stored for the platform team and thanks the visitor', async ({
    page,
    request,
  }) => {
    const college = `E2E College ${Date.now()}`;
    const form = await fill(page, college);
    await form.getByLabel('Anything we should know? (optional)').fill('60 BCA students');
    await form.getByRole('button', { name: 'Send request' }).click();

    await expect(page.getByRole('status')).toContainText('we have your request');
    await expect(page.getByRole('form', { name: 'Request a proposal' })).toHaveCount(0);

    const headers = await authHeader(request, TEST_USERS.super_admin);
    const res = await request.get('/__api/admin/enquiries?limit=100', { headers });
    const stored = (await res.json()).enquiries.find((e) => e.collegeName === college);
    expect(stored).toMatchObject({
      contactName: 'Meena Joshi',
      email: 'tpo@college.test',
      phone: '+919876543210',
      programme: 'career_ready',
      status: 'new',
      message: '60 BCA students',
    });
  });

  test('an incomplete form shows what is wrong and sends nothing', async ({ page }) => {
    let posted = false;
    await page.route('**/__api/enquiries', (route) => {
      posted = true;
      return route.abort();
    });
    await page.goto('/');
    const form = page.getByRole('form', { name: 'Request a proposal' });
    await form.getByLabel('Email', { exact: true }).fill('not-an-email');
    await form.getByRole('button', { name: 'Send request' }).click();

    await expect(form.getByText('Enter your name')).toBeVisible();
    await expect(form.getByText('Enter a valid email address')).toBeVisible();
    await expect(form.getByText('Enter a valid phone number')).toBeVisible();
    expect(posted).toBe(false);
  });

  test('a failed send shows an error and keeps what was typed', async ({ page }) => {
    await page.route('**/__api/enquiries', (route) =>
      route.fulfill({ status: 500, json: { error: 'boom' } })
    );
    const form = await fill(page, 'Keep My Text College');
    await form.getByRole('button', { name: 'Send request' }).click();

    await expect(form.getByRole('alert')).toContainText('could not send your request');
    await expect(form.getByLabel('College or institute')).toHaveValue('Keep My Text College');
    await expect(form.getByRole('button', { name: 'Send request' })).toBeEnabled();
  });

  test('a rate-limited send says to try again later', async ({ page }) => {
    await page.route('**/__api/enquiries', (route) =>
      route.fulfill({ status: 429, json: { error: 'Too many submissions, try again later' } })
    );
    const form = await fill(page, 'Busy College');
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(form.getByRole('alert')).toContainText('Please try again later');
  });

  test('a bot that fills the hidden field looks accepted but nothing is stored', async ({
    page,
    request,
  }) => {
    const college = `Bot College ${Date.now()}`;
    const form = await fill(page, college);
    await form.locator('input[name="website"]').fill('http://spam.test', { force: true });
    await form.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('status')).toBeVisible();

    const headers = await authHeader(request, TEST_USERS.super_admin);
    const res = await request.get('/__api/admin/enquiries?limit=100', { headers });
    expect((await res.json()).enquiries.some((e) => e.collegeName === college)).toBe(false);
  });

  test('the hidden field is not offered to keyboard or screen-reader users', async ({ page }) => {
    await page.goto('/');
    const trap = page.locator('input[name="website"]');
    await expect(trap).toHaveAttribute('tabindex', '-1');
    await expect(trap.locator('xpath=ancestor::div[@aria-hidden="true"]')).toHaveCount(1);
    await expect(page.getByRole('textbox', { name: /website/i })).toHaveCount(0);
  });
});
