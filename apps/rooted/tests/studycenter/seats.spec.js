import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// Phase 2 of TICKET-007: seats, per-shift standing holds, and the seat map.
// Seeded: 12 seats (A-1..A-6 in Hall 1, B-1..B-6 in Hall 2), Morning 06:00-14:00 and
// Evening 14:00-22:00, member1 holding A-1 in the Morning and B-4 in the Evening,
// member2 holding nothing.

async function openShift(page, name) {
  await page.getByLabel('Shift').click();
  await page.getByRole('option', { name: new RegExp(name) }).click();
}

const seat = (page, label) => page.getByTestId(`seat-${label}`);

test.describe('seat map', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('shows who holds each seat in a shift, and the same seat free in the other shift', async ({
    page,
  }) => {
    await page.goto('/academic/seat-map');

    await openShift(page, 'Morning');
    await expect(seat(page, 'A-1')).toContainText('Held by Member One Study', { timeout: 15_000 });
    await expect(seat(page, 'B-4')).toContainText('Free');

    await openShift(page, 'Evening');
    await expect(seat(page, 'B-4')).toContainText('Held by Member One Study');
    // A-1 is held in the Morning only, so another member could sit there now.
    await expect(seat(page, 'A-1')).toContainText('Free');
    await expect(page.getByTestId('pool-size')).toContainText(/seats are free for day passes/);
  });

  test('the owner seats a learner, then ends the seat', async ({ page }) => {
    await page.goto('/academic/seat-map');
    await openShift(page, 'Morning');
    await expect(seat(page, 'A-2')).toContainText('Free', { timeout: 15_000 });

    await page.getByLabel('Learner').click();
    await page.getByRole('option', { name: 'Member Two Study' }).click();
    await seat(page, 'A-2').getByRole('button', { name: 'Seat here' }).click();
    await expect(seat(page, 'A-2')).toContainText('Held by Member Two Study');

    await seat(page, 'A-2').getByRole('button', { name: 'End' }).click();
    await expect(seat(page, 'A-2')).toContainText('Free');
  });

  test('a held seat has no Seat here button', async ({ page }) => {
    await page.goto('/academic/seat-map');
    await openShift(page, 'Morning');
    await expect(seat(page, 'A-1')).toContainText('Held by', { timeout: 15_000 });
    await expect(seat(page, 'A-1').getByRole('button', { name: 'Seat here' })).toHaveCount(0);
  });
});

test.describe('seat management', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('adds a run of seats and takes them out of use again', async ({ page }) => {
    await page.goto('/academic/seats');
    await expect(page.getByRole('heading', { name: 'Seats', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByLabel('Prefix').fill('Z-');
    await page.getByLabel('How many').fill('2');
    await page.getByRole('button', { name: 'Add seats' }).click();
    await expect(page.getByRole('status')).toContainText('2 added');

    // Adding the same run again skips what exists.
    await page.getByLabel('How many').fill('2');
    await page.getByRole('button', { name: 'Add seats' }).click();
    await expect(page.getByRole('status')).toContainText('0 added, 2 already existed');

    for (const label of ['Z-1', 'Z-2']) {
      const row = page.getByRole('row', { name: new RegExp(label) });
      await row.getByRole('button', { name: 'Take out of use' }).click();
      await expect(row).toContainText('Out of use');
    }
  });

  test('a seat someone holds cannot be taken out of use, and the page says who', async ({
    page,
  }) => {
    await page.goto('/academic/seats');
    const row = page.getByRole('row', { name: /A-1/ });
    await row.getByRole('button', { name: 'Take out of use' }).click();
    await expect(page.getByRole('alert')).toContainText('Member One Study');
    await expect(row).toContainText('In use');
  });
});

test.describe('front desk', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk });

  test('can open the seat map and the seat list', async ({ page }) => {
    await page.goto('/academic/seat-map');
    await expect(page.getByRole('heading', { name: 'Seat map' })).toBeVisible({ timeout: 15_000 });
    await page.goto('/academic/seats');
    await expect(page.getByRole('heading', { name: 'Seats', exact: true })).toBeVisible();
  });
});
