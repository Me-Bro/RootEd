import { test, expect } from '@playwright/test';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// Phase 3 of TICKET-007: plans, day passes, the desk sale and the discount policy.
// Seeded: "Day pass" 150, "Morning monthly" 1200, "Evening monthly" 1000; a standing
// "Student 10%" for member1; an "Open 5%" for everybody; policy owner-only.

async function choose(page, label, option) {
  await page.getByLabel(label).click();
  await page.getByRole('option', { name: option }).click();
}

async function findLearner(page, text, name) {
  await page.getByLabel('Find a learner').fill(text);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name }).click();
}

test.describe('the front desk sells', () => {
  test.use({ storageState: STUDY_AUTH_STATES.desk });

  test('registers a walk-in and sells a day pass, with a receipt', async ({ page }) => {
    await page.goto('/fee/sell');
    await expect(page.getByRole('heading', { name: 'Sell a plan' })).toBeVisible({
      timeout: 15_000,
    });

    const phone = `98${Math.floor(10000000 + Math.random() * 89999999)}`;
    await page.getByRole('button', { name: 'Register a walk-in' }).click();
    await page.getByLabel('First name').fill('Walk');
    await page.getByLabel('Last name').fill('Visitor');
    await page.getByLabel('Phone number').fill(phone);
    await page.getByRole('button', { name: 'Save walk-in' }).click();
    await expect(page.getByText('Walk Visitor')).toBeVisible();
    await expect(page.getByTestId('entitlement')).toContainText('No plan yet');

    await choose(page, 'Plan', 'Day pass');
    await expect(page.getByTestId('sale-price')).toContainText('150');
    await page.getByRole('button', { name: 'Sell and take payment' }).click();

    const done = page.getByTestId('sale-done');
    await expect(done).toContainText('Day pass sold to Walk');
    await expect(done).toContainText('150');
    await expect(done.getByRole('link', { name: 'Open the receipt' })).toBeVisible();
  });

  test('a returning walk-in is found by phone, not registered twice', async ({ page }) => {
    await page.goto('/fee/sell');
    const phone = `97${Math.floor(10000000 + Math.random() * 89999999)}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.getByRole('button', { name: 'Register a walk-in' }).click();
      await page.getByLabel('First name').fill('Repeat');
      await page.getByLabel('Last name').fill('Caller');
      await page.getByLabel('Phone number').fill(phone);
      await page.getByRole('button', { name: 'Save walk-in' }).click();
      await expect(page.getByText('Repeat Caller')).toBeVisible();
      await page.getByRole('button', { name: 'Change' }).click();
    }
    await page.getByLabel('Find a learner').fill(phone);
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('button', { name: /Repeat Caller/ })).toHaveCount(1);
  });

  test('the learner’s standing discount is applied on its own', async ({ page }) => {
    await page.goto('/fee/sell');
    await findLearner(page, 'Member One', /Member One Study/);
    await choose(page, 'Plan', 'Evening monthly');
    await page.getByRole('button', { name: 'Sell and take payment' }).click();
    const done = page.getByTestId('sale-done');
    await expect(done).toContainText('Evening monthly sold to Member');
    await expect(done).toContainText('Discount applied');
  });

  test('under owner-only policy the desk is not offered a discount choice', async ({ page }) => {
    await page.goto('/fee/sell');
    await expect(page.getByRole('heading', { name: 'Sell a plan' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Discount')).toHaveCount(0);
  });

  test('cannot create plans or open the discount catalog', async ({ page }) => {
    await page.goto('/fee/discounts');
    await expect(page.getByRole('heading', { name: 'Discounts' })).toHaveCount(0);
  });
});

test.describe('the owner', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('sees the discount choice, and can give the 5% discount on a day pass', async ({ page }) => {
    await page.goto('/fee/sell');
    await findLearner(page, 'Member Two', /Member Two Study/);
    await choose(page, 'Plan', 'Day pass');
    await choose(page, 'Discount', 'Open 5%');
    await page.getByRole('button', { name: 'Sell and take payment' }).click();
    const done = page.getByTestId('sale-done');
    await expect(done).toContainText('Day pass sold to Member');
    await expect(done).toContainText('Discount applied');
  });

  test('adds a discount for one learner, which needs an end date', async ({ page }) => {
    await page.goto('/fee/discounts');
    await expect(page.getByRole('heading', { name: 'Discounts' })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByLabel('Name', { exact: true }).fill('Winter 15%');
    await page.getByLabel('Value').fill('15');
    await choose(page, 'Applies to', 'One learner');
    await findLearner(page, 'Member Two', /Member Two Study/);
    // No end date yet, so it cannot be added.
    await expect(page.getByRole('button', { name: 'Add discount' })).toBeDisabled();
    await page.getByLabel('Until (required)').fill('2099-12-31');
    await page.getByRole('button', { name: 'Add discount' }).click();
    await expect(page.getByRole('row', { name: /Winter 15%/ })).toContainText('Member Two Study');
  });

  test('creates a plan: a day pass with no installments and no year to pick', async ({ page }) => {
    await page.goto('/fee/structures');
    await page.getByRole('button', { name: /New/ }).first().click();
    await page.getByLabel('Name', { exact: true }).fill('Weekend pass');
    await page.getByLabel('Type of fee').selectOption('day_pass');
    await expect(page.getByRole('dialog').getByLabel('Academic year')).toHaveCount(0);
    await page.getByPlaceholder(/Label/i).first().fill('Weekend pass');
    await page
      .getByPlaceholder(/Amount/i)
      .first()
      .fill('200');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('[data-slot="card-title"]', { hasText: 'Weekend pass' })).toBeVisible(
      {
        timeout: 15_000,
      }
    );
  });
});
