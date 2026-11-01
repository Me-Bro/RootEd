import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// Phase 4 of TICKET-007: the front desk checks learners in and out.
//
// The API decides "open" from the server's clock, which a browser spec cannot move,
// so these run only while the seeded centre (06:00-22:00 IST) is open. Out-of-hours
// entry, the owner override and the auto-close sweeper are covered by the Jest suite
// (visitRoutes.test.js) with a fixed clock.
const istHour = Number(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
);
const centreIsOpen = istHour >= 6 && istHour < 22;

test.describe('front desk', () => {
  test.skip(!centreIsOpen, 'the seeded centre is closed right now (06:00-22:00 IST)');
  test.use({ storageState: STUDY_AUTH_STATES.desk });
  test.describe.configure({ mode: 'serial' });

  async function pick(page, text, name) {
    await page.getByLabel('Find a learner').fill(text);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('button', { name }).click();
  }

  test('a member with a valid plan checks in on their own seat with no warning, then checks out', async ({
    page,
  }) => {
    await page.goto('/desk');
    await expect(page.getByRole('heading', { name: 'Front desk' })).toBeVisible({
      timeout: 15_000,
    });

    await pick(page, 'Member One', /Member One Study/);
    await expect(page.getByTestId('desk-entitlement')).toContainText('Plan is valid');
    await page.getByRole('button', { name: 'Check in', exact: true }).click();

    const done = page.getByTestId('checkin-done');
    await expect(done).toContainText('Member checked in on seat A-1');
    await expect(done.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('row', { name: /Member One Study/ })).toContainText('A-1');

    await page
      .getByRole('row', { name: /Member One Study/ })
      .getByRole('button', { name: 'Check out' })
      .click();
    await expect(page.getByRole('row', { name: /Member One Study/ })).toHaveCount(0);
  });

  test('a learner with no plan is let in with a warning, not refused', async ({ page }) => {
    await page.goto('/desk');
    await pick(page, 'Member Two', /Member Two Study/);
    await expect(page.getByTestId('desk-entitlement')).toContainText('No plan yet');
    await page.getByRole('button', { name: 'Check in', exact: true }).click();

    const done = page.getByTestId('checkin-done');
    await expect(done).toContainText('checked in');
    await expect(done.getByRole('status')).toContainText('They have no plan');
    await expect(page.getByRole('row', { name: /Member Two Study/ })).toContainText('No plan');

    await page
      .getByRole('row', { name: /Member Two Study/ })
      .getByRole('button', { name: 'Check out' })
      .click();
    await expect(page.getByRole('row', { name: /Member Two Study/ })).toHaveCount(0);
  });

  test('a walk-in buys a day pass and is checked in on a seat nobody holds (AC4)', async ({
    page,
  }) => {
    const phone = `96${Math.floor(10000000 + Math.random() * 89999999)}`;
    await page.goto('/fee/sell');
    await page.getByRole('button', { name: 'Register a walk-in' }).click();
    await page.getByLabel('First name').fill('Desk');
    await page.getByLabel('Last name').fill('Visitor');
    await page.getByLabel('Phone number').fill(phone);
    await page.getByRole('button', { name: 'Save walk-in' }).click();
    await page.getByLabel('Plan').click();
    await page.getByRole('option', { name: 'Day pass' }).click();
    await page.getByRole('button', { name: 'Sell and take payment' }).click();
    await expect(page.getByTestId('sale-done')).toContainText('Day pass sold to Desk');

    // From the sale straight to the desk, with the learner already chosen.
    await page.getByRole('link', { name: 'Check in now' }).click();
    await expect(page.getByTestId('desk-entitlement')).toContainText('Plan is valid');
    await page.getByRole('button', { name: 'Check in', exact: true }).click();
    const done = page.getByTestId('checkin-done');
    await expect(done).toContainText('Desk checked in on seat');
    // A-1 and B-4 are held by a member; a walk-in is never put on them.
    await expect(done).not.toContainText('seat A-1');
    await expect(done).not.toContainText('seat B-4');
    await expect(done.getByRole('status')).toHaveCount(0);

    await page
      .getByRole('row', { name: /Desk Visitor/ })
      .getByRole('button', { name: 'Check out' })
      .click();
    await expect(page.getByRole('row', { name: /Desk Visitor/ })).toHaveCount(0);
  });
});
