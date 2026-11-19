import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// A study-center learner's page: after adding a learner you land on it, and everything
// about them (seat, plan, payments, discount, visits, history) is managed from there.
// Seeded: member1 has a paid plan, two past visits, one payment (RCP-SEED-STUDY-0001) and
// four audit entries; member2 has nothing.

const AADHAAR = '234567890124';

const istHour = Number(
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
);
// The API decides "open" from the server's clock; check-in only works while the seeded
// centre (06:00-22:00 IST) is open.
const centreIsOpen = istHour >= 6 && istHour < 22;

const daysAgo = (days) => {
  const d = new Date(Date.now() - days * 86_400_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function memberId(key) {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8')).studyTenant.members[key]._id;
}

// Native <select>s are driven by the option's value; find it by its visible text.
async function pick(select, text) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value);
}

const section = (page, name) => page.locator(`section[aria-label="${name}"]`);
const tab = (page, name) => page.getByRole('tab', { name, exact: true });

test.describe('the owner manages a new learner from their page', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });
  test.describe.configure({ mode: 'serial' });

  let learnerUrl;
  const historyBodies = [];
  const lastName = `Learner${Date.now()}`;

  test('adding a learner opens their page, with a notice and the four tabs', async ({ page }) => {
    await page.goto('/academic/students');
    await page.getByRole('button', { name: 'Add Student' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('First Name').fill('History');
    await dialog.getByLabel('Last Name').fill(lastName);
    await dialog.getByRole('button', { name: 'Add Student' }).click();

    await expect(page).toHaveURL(/\/academic\/students\/[0-9a-f]{24}$/, { timeout: 15_000 });
    learnerUrl = new URL(page.url()).pathname;
    await expect(page.getByRole('status')).toContainText(`History ${lastName} added`);
    for (const name of ['Overview', 'Visits', 'Billing', 'History']) {
      await expect(tab(page, name)).toBeVisible();
    }

    // A reload does not repeat the notice.
    await page.reload();
    await expect(tab(page, 'Overview')).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('a seat is given in a shift, then released', async ({ page }) => {
    await page.goto(learnerUrl);
    await expect(page.getByText('No seat in any shift.')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Give a seat' }).click();
    await pick(page.getByLabel('Choose a shift'), 'Morning');
    const seats = page.getByLabel('Choose a free seat');
    await expect(seats.locator('option').nth(1)).toBeAttached({ timeout: 10_000 });
    await seats.selectOption(await seats.locator('option').nth(1).getAttribute('value'));
    await page.getByRole('button', { name: 'Give seat' }).click();
    await expect(page.getByText(/Morning: seat [A-Z]-\d+/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Release' }).click();
    await expect(page.getByText('No seat in any shift.')).toBeVisible({ timeout: 10_000 });
  });

  test('the Aadhaar number can be saved and is never shown in the history', async ({ page }) => {
    page.on('response', async (res) => {
      if (res.url().includes('/history')) historyBodies.push(await res.text().catch(() => ''));
    });
    await page.goto(learnerUrl);
    await page.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Other details', { exact: true }).click();
    await dialog.getByLabel('Aadhaar number').fill(AADHAAR);
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });
  });

  test('a plan is started, paid, refunded, and a discount is added, all from the Billing tab', async ({
    page,
  }) => {
    await page.goto(`${learnerUrl}?tab=billing`);
    await expect(page.getByTestId('entitlement')).toBeVisible({ timeout: 15_000 });

    await pick(page.getByLabel('Choose a monthly or weekly plan'), 'Seat monthly');
    await page.getByLabel('Start date').fill(daysAgo(10));
    await page.getByRole('button', { name: 'Start plan' }).click();
    await expect(page.getByTestId('plan-state')).toHaveText('Billing', { timeout: 10_000 });

    // Something is due now: take part of it.
    const due = section(page, 'Due now');
    await expect(due).toContainText('to pay', { timeout: 10_000 });
    await due.getByRole('button', { name: 'Collect payment' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Amount').fill('500');
    await dialog.getByRole('button', { name: 'Record Payment' }).click();
    await expect(dialog.getByText('Payment recorded successfully.')).toBeVisible({
      timeout: 10_000,
    });
    await page.keyboard.press('Escape');

    const payments = section(page, 'Payments');
    await expect(payments).toContainText('RCP-', { timeout: 10_000 });
    await expect(payments).toContainText('Cash');

    // The owner can refund it.
    await payments.getByRole('button', { name: 'Refund' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Refund', exact: true }).click();
    await expect(payments).toContainText('Refunded', { timeout: 10_000 });

    // And add a standing discount, which must end.
    await page.getByRole('button', { name: 'Add a discount' }).click();
    await page.locator('#student-discount-name').fill('Scholar');
    await page.locator('#student-discount-value').fill('10');
    await page.locator('#student-discount-to').fill('2099-12-31');
    await page.getByRole('button', { name: 'Add discount' }).click();
    await expect(section(page, 'Discount')).toContainText('Scholar', { timeout: 10_000 });
  });

  test('the learner is checked in and out from the Visits tab', async ({ page }) => {
    test.skip(!centreIsOpen, 'the seeded centre is closed right now (06:00-22:00 IST)');
    await page.goto(`${learnerUrl}?tab=visits`);
    await expect(page.getByRole('button', { name: 'Check in', exact: true })).toBeEnabled({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Check in', exact: true }).click();
    await expect(page.getByTestId('checkin-done')).toContainText('Checked in on seat', {
      timeout: 10_000,
    });
    await expect(page.getByText('Inside now')).toBeVisible();

    await page.getByRole('button', { name: 'Check out' }).click();
    await expect(page.getByText('Inside now')).toHaveCount(0, { timeout: 10_000 });
  });

  test('the History tab lists all of it, with who did it', async ({ page }) => {
    page.on('response', async (res) => {
      if (res.url().includes('/history')) historyBodies.push(await res.text().catch(() => ''));
    });
    await page.goto(`${learnerUrl}?tab=history`);

    // The audit log is written by a worker, so a change can take a moment to appear.
    const expected = [
      'Added as a learner',
      'Joined the Morning shift',
      /Given seat [A-Z]-\d+ in Morning/,
      /Seat [A-Z]-\d+ in Morning released/,
      'Aadhaar number saved.',
      /Plan set: .*Monthly/,
      /Paid .*500.* by Cash/,
      /Payment of .*500.* refunded/,
      'Discount added: Scholar',
      ...(centreIsOpen ? [/Checked in on seat/, /Checked out from seat/] : []),
    ];
    for (const text of expected) {
      await expect(async () => {
        await page.getByRole('button', { name: 'Refresh' }).click();
        await expect(page.getByText(text).first()).toBeVisible({ timeout: 1_500 });
      }).toPass({ timeout: 20_000 });
    }

    // Filtering narrows it.
    await page.getByRole('button', { name: 'Fees', exact: true }).click();
    await expect(page.getByText('Plan set:').first()).toBeVisible();
    await expect(page.getByText('Added as a learner')).toHaveCount(0);

    expect(historyBodies.length).toBeGreaterThan(0);
    for (const body of historyBodies) expect(body).not.toContain(AADHAAR);
  });
});

test.describe('the front desk and the owner see different things', () => {
  test.describe('front desk', () => {
    test.use({ storageState: STUDY_AUTH_STATES.desk });

    test('can read a learner history, but not the IP addresses', async ({ page }) => {
      await page.goto(`/academic/students/${memberId('studyMember1')}?tab=history`);
      await expect(page.getByText('Added as a learner')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Details updated: Mobile/)).toBeVisible();
      await expect(page.getByText(/Paid .*1,080.* by Cash/)).toBeVisible();
      await expect(page.getByText('10.0.0.5')).toHaveCount(0);
    });

    test('can take a payment and give a seat, but not refund or add a discount', async ({
      page,
    }) => {
      await page.goto(`/academic/students/${memberId('studyMember1')}?tab=billing`);
      await expect(section(page, 'Payments')).toContainText('RCP-SEED-STUDY-0001', {
        timeout: 15_000,
      });
      await expect(page.getByRole('button', { name: 'Refund' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add a discount' })).toHaveCount(0);

      await page.goto(`/academic/students/${memberId('studyMember2')}`);
      await expect(page.getByRole('button', { name: 'Give a seat' })).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test.describe('owner', () => {
    test.use({ storageState: STUDY_AUTH_STATES.owner });

    test('sees the IP addresses and can refund a payment', async ({ page }) => {
      await page.goto(`/academic/students/${memberId('studyMember1')}?tab=history`);
      await expect(page.getByText(/10\.0\.0\.5/).first()).toBeVisible({ timeout: 15_000 });

      await page.goto(`/academic/students/${memberId('studyMember1')}?tab=billing`);
      await expect(section(page, 'Payments').getByRole('button', { name: 'Refund' })).toBeVisible({
        timeout: 15_000,
      });
    });
  });
});

test.describe('who can open which tab', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk });

  test('a tab in the address bar opens it, and an unknown one falls back to Overview', async ({
    page,
  }) => {
    const id = memberId('studyMember1');
    await page.goto(`/academic/students/${id}?tab=visits`);
    await expect(tab(page, 'Visits')).toHaveAttribute('aria-selected', 'true', {
      timeout: 15_000,
    });
    await page.goto(`/academic/students/${id}?tab=nonsense`);
    await expect(tab(page, 'Overview')).toHaveAttribute('aria-selected', 'true', {
      timeout: 15_000,
    });
  });
});
