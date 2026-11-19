import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// TICKET-009: the front desk is one screen: learner list, one-tap check-in and
// check-out, a live seat map, today's activity and (owner only) check out everyone.
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

const row = (page, name) => page.getByTestId(`learner-${name}`);
const tile = (page, label) => page.getByTestId(`desk-seat-${label}`);

async function openDesk(page) {
  await page.goto('/desk');
  await expect(page.getByRole('heading', { name: 'Front desk' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('desk-summary')).toBeVisible();
}

test.describe('front desk', () => {
  test.skip(!centreIsOpen, 'the seeded centre is closed right now (06:00-22:00 IST)');
  test.use({ storageState: STUDY_AUTH_STATES.desk });
  test.describe.configure({ mode: 'serial' });

  test('desk staff land on the front desk, which is in the sidebar (AC1)', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/desk', { timeout: 15_000 });
    await expect(page.getByRole('link', { name: 'Front desk' }).first()).toBeVisible();
    // Only an owner closes the day.
    await expect(page.getByRole('button', { name: 'Check out everyone' })).toHaveCount(0);
  });

  test('a member with a valid plan checks in on their own seat in one tap, then checks out (AC2)', async ({
    page,
  }) => {
    await openDesk(page);
    const member = row(page, 'Member One Study');
    await expect(member).toContainText('Usual seat A-1');

    await member.getByRole('button', { name: 'Check in', exact: true }).click();
    const done = page.getByTestId('checkin-done');
    await expect(done).toContainText('Member One Study checked in on seat A-1');
    await expect(done.getByRole('status')).toHaveCount(0);
    await expect(member).toContainText('On seat A-1');
    await expect(tile(page, 'A-1')).toHaveAttribute('data-state', 'occupied');
    await expect(page.getByTestId('desk-activity')).toContainText('Member One Study');

    await member.getByRole('button', { name: 'Check out' }).click();
    await expect(member).toContainText('Usual seat A-1');
    // A member's own seat is "held", not free, while they are away (AC5).
    await expect(tile(page, 'A-1')).toHaveAttribute('data-state', 'held');
  });

  test('a learner with no plan shows the warning before check-in and is still let in (AC3)', async ({
    page,
  }) => {
    await openDesk(page);
    const member = row(page, 'Member Two Study');
    await expect(member).toContainText('No plan');
    await member
      .getByRole('button', { name: /Member Two Study/ })
      .first()
      .click();
    await expect(page.getByTestId('desk-entitlement')).toContainText('No plan yet');

    await member.getByRole('button', { name: 'Check in', exact: true }).click();
    const done = page.getByTestId('checkin-done');
    await expect(done).toContainText('checked in');
    await expect(done.getByRole('status')).toContainText('They have no plan');

    await member.getByRole('button', { name: 'Check out' }).click();
    await expect(member).toContainText('No seat of their own');
  });

  test('tapping a free seat checks the picked learner in; tapping the occupied seat checks them out (AC4)', async ({
    page,
  }) => {
    await openDesk(page);
    // With nobody picked, a free seat asks for a learner first.
    await tile(page, 'A-3').click();
    await expect(page.getByRole('alert')).toContainText('Pick a learner');

    const member = row(page, 'Member Two Study');
    await member
      .getByRole('button', { name: /Member Two Study/ })
      .first()
      .click();
    await tile(page, 'A-3').click();
    await expect(page.getByTestId('checkin-done')).toContainText('checked in on seat A-3');
    await expect(tile(page, 'A-3')).toHaveAttribute('data-state', 'occupied');

    await tile(page, 'A-3').click();
    await page.getByTestId('seat-checkout').getByRole('button', { name: 'Check out' }).click();
    await expect(tile(page, 'A-3')).toHaveAttribute('data-state', 'free');
  });

  test('a new walk-in is registered at the desk, may use a pool seat, and never a member seat (EH4, EH5)', async ({
    page,
  }) => {
    const phone = `96${Math.floor(10000000 + Math.random() * 89999999)}`;
    await openDesk(page);
    await page.getByRole('button', { name: 'New walk-in' }).click();
    await page.getByLabel('First name').fill('Desk');
    await page.getByLabel('Last name').fill('Visitor');
    await page.getByLabel('Phone number').fill(phone);
    await page.getByRole('button', { name: 'Save walk-in' }).click();

    const visitor = row(page, 'Desk Visitor');
    await expect(visitor).toBeVisible();
    // A seat a member holds is refused for a walk-in, and the page says why.
    await tile(page, 'A-1').click();
    await expect(page.getByRole('alert')).toContainText('A walk-in can only use a seat');

    await visitor.getByRole('button', { name: 'Check in', exact: true }).click();
    const done = page.getByTestId('checkin-done');
    await expect(done).toContainText('Desk Visitor checked in on seat');
    await expect(done).not.toContainText('seat A-1');
    await expect(done).not.toContainText('seat B-4');

    await visitor.getByRole('button', { name: 'Check out' }).click();
    await expect(visitor).toContainText('No seat of their own');
  });

  test('filters narrow the list to who is inside or has a plan warning', async ({ page }) => {
    await openDesk(page);
    const member = row(page, 'Member One Study');
    await member.getByRole('button', { name: 'Check in', exact: true }).click();
    await expect(member).toContainText('On seat A-1');

    await page.getByRole('button', { name: 'Inside', exact: true }).click();
    await expect(member).toBeVisible();
    await expect(row(page, 'Member Two Study')).toHaveCount(0);

    await page.getByRole('button', { name: 'Plan warning' }).click();
    await expect(row(page, 'Member Two Study')).toBeVisible();
    await expect(member).toHaveCount(0);

    await page.getByRole('button', { name: 'Everyone' }).click();
    await member.getByRole('button', { name: 'Check out' }).click();
    await expect(member).toContainText('Usual seat A-1');
  });
});

test.describe('check out everyone (owner)', () => {
  test.skip(!centreIsOpen, 'the seeded centre is closed right now (06:00-22:00 IST)');
  test.use({ storageState: STUDY_AUTH_STATES.owner });
  test.describe.configure({ mode: 'serial' });

  test('the owner closes the day and the visits are marked as closed by the owner (AC6)', async ({
    page,
  }) => {
    await openDesk(page);
    await row(page, 'Member One Study')
      .getByRole('button', { name: 'Check in', exact: true })
      .click();
    await expect(page.getByTestId('checkin-done')).toContainText('checked in');

    await page.getByRole('button', { name: 'Check out everyone' }).click();
    await page.getByRole('button', { name: 'Check everyone out' }).click();

    await expect(page.getByTestId('checkin-done')).toContainText('Checked out');
    await expect(page.getByTestId('stat-inside')).toContainText('0');
    await expect(page.getByTestId('desk-activity')).toContainText('Closed by owner');
    await expect(tile(page, 'A-1')).toHaveAttribute('data-state', 'held');
  });
});
