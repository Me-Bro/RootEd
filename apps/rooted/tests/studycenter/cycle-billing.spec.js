import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// TICKET-008 phase 5: monthly and weekly fee plans for a study center. Seeded: "Seat
// monthly" 1500, "Seat weekly" 400 and a one-off "Registration" 500; member2 is on no
// plan. A date `days` ago, as the date input wants it.
const daysAgo = (days) => {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
};

function memberTwoId() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8')).studyTenant.members.studyMember2._id;
}

const panel = (page) => page.locator('section[aria-label="Billing"]');

// Choose the option of a <select> whose text contains `text`.
async function pick(select, text) {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  await select.selectOption(value);
}

test.describe('the owner sets up and runs a fee plan', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('creates a monthly fee: a cycle, no due date, priced per month', async ({ page }) => {
    const name = `Cycle monthly ${Date.now()}`;
    await page.goto('/fee/structures');
    await page.getByRole('button', { name: /New/ }).first().click();
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Billing').selectOption('monthly');
    // A cycle fee has no due date of its own and no year to pick.
    await expect(page.getByRole('dialog').getByLabel(/Due date/i)).toHaveCount(0);
    await expect(page.getByRole('dialog').getByLabel('Academic year')).toHaveCount(0);
    await page.getByPlaceholder(/Label/i).first().fill('Seat');
    await page
      .getByPlaceholder(/Amount/i)
      .first()
      .fill('1800');
    await page.getByRole('button', { name: 'Create' }).click();

    const card = page.locator('[data-slot="card"]', { hasText: name });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText('Monthly');
    await expect(card).toContainText('per month');
  });

  test('puts a learner on a plan from a start date, then pauses and resumes it', async ({
    page,
  }) => {
    await page.goto(`/academic/students/${memberTwoId()}`);
    await expect(panel(page)).toBeVisible({ timeout: 15_000 });

    // A second run starts from the same seed, but a re-run on one database may find the
    // plan already there.
    if (await page.getByRole('button', { name: 'Start plan' }).isVisible()) {
      await pick(page.getByLabel('Choose a monthly or weekly plan'), 'Seat monthly');
      await page.getByLabel('Start date').fill(daysAgo(10));
      await page.getByRole('button', { name: 'Start plan' }).click();
    }

    // The ledger: a closed or current cycle with its charge, and billing running.
    await expect(page.getByTestId('fee-plan-ledger')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('plan-state')).toHaveText('Billing');

    await page.getByRole('button', { name: 'Pause billing' }).click();
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect(page.getByTestId('plan-state')).toHaveText('Paused', { timeout: 10_000 });
    await expect(page.getByText(/Billing paused/)).toBeVisible();

    await page.getByRole('button', { name: 'Resume billing' }).click();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(page.getByTestId('plan-state')).toHaveText('Billing', { timeout: 10_000 });
  });

  test('a one-off fee is added alongside the plan and removed again', async ({ page }) => {
    await page.goto(`/academic/students/${memberTwoId()}`);
    await expect(panel(page)).toBeVisible({ timeout: 15_000 });
    const oneOff = page.getByLabel('Choose a one-off fee');
    if (await oneOff.isVisible()) {
      await pick(oneOff, 'Registration');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
    }
    await expect(panel(page).getByText('Registration').first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('No one-off fees.')).toBeVisible({ timeout: 10_000 });
  });

  test('a study center has no Defaulters tab', async ({ page }) => {
    await page.goto('/fee');
    await expect(page.getByRole('button', { name: 'Assignments' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /Defaulters/ })).toHaveCount(0);
  });

  test('a learner can be withdrawn but never graduated', async ({ page }) => {
    await page.goto(`/academic/students/${memberTwoId()}`);
    await expect(page.getByRole('button', { name: /Mark Withdrawn/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: /Mark Graduated/i })).toHaveCount(0);
  });
});

test.describe('the front desk', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk });

  test('can see the plan but not pause it', async ({ page }) => {
    await page.goto(`/academic/students/${memberTwoId()}`);
    await expect(panel(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Pause billing' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Resume billing' })).toHaveCount(0);
  });
});
