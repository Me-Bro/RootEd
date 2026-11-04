import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';
import { STUDY_AUTH_STATES } from '../fixtures/auth.js';

// A study center collects the batch-group profile fields (exam target, how the
// learner found the centre), not the school ones (category, previous school).

function memberOneId() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8')).studyTenant.members.studyMember1._id;
}

test.describe('learner profile', () => {
  test.use({ storageState: STUDY_AUTH_STATES.owner });

  test('shows the exam target and how they joined, and no school-only fields', async ({ page }) => {
    await page.goto(`/academic/students/${memberOneId()}`);
    await expect(page.getByText('UPSC')).toBeVisible();
    await expect(page.getByText('Referral')).toBeVisible();
    await expect(page.getByText('Category')).toHaveCount(0);
  });

  test('the add form asks for batch fields only, and saves them', async ({ page }) => {
    const admissionNo = `SC-PF-${Date.now()}`;
    await page.goto('/academic/students');
    await page.getByRole('button', { name: 'Add Student' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Admission No').fill(admissionNo);
    await dialog.getByLabel('First Name').fill('Aspirant');
    await dialog.getByLabel('Last Name').fill('Learner');

    await dialog.getByText('Other details', { exact: true }).click();
    await expect(dialog.getByLabel('Category')).toHaveCount(0);
    await expect(dialog.getByLabel('Previous school')).toHaveCount(0);
    await dialog.getByLabel('Exam target').fill('NEET');
    await dialog.getByLabel('How they heard about us').fill('Walk-by');
    await dialog.getByRole('button', { name: 'Add Student' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 8_000 });

    await page.getByPlaceholder(/search/i).fill(admissionNo);
    await page.getByRole('link', { name: new RegExp(admissionNo) }).click();
    await expect(page.getByText('NEET')).toBeVisible();
    await expect(page.getByText('Walk-by')).toBeVisible();
  });
});
