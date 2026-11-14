import { test, expect } from '@playwright/test';
import { checkA11y, injectAxe } from 'axe-playwright';
import { readFileSync } from 'fs';
import path from 'path';
import { AUTH_STATES } from '../fixtures/auth.js';
import { createTestApiClient } from '../fixtures/data.js';

function getTestIds() {
  const p = path.join(import.meta.dirname, '../seed/.test-ids.json');
  return JSON.parse(readFileSync(p, 'utf-8'));
}

const LOGO = path.join(import.meta.dirname, '../fixtures/files/logo.png');

// These tests change the school's saved report card design, so they run one after
// another and put the defaults back at the end (the settings cannot be unset, only
// overwritten — the defaults below render exactly like an unconfigured school).
const DEFAULTS = {
  preset: 'classic',
  accentColor: '#000000',
  schoolName: '',
  subtitle: '',
  footerText: '',
  signatories: ['Class Teacher', 'Principal'],
  gradingLegend: '',
  showRank: true,
  showAttendance: true,
};

// True when the canvas holds more than a blank white page.
async function hasInk(canvas) {
  return canvas.evaluate((el) => {
    const { data } = el.getContext('2d').getImageData(0, 0, el.width, el.height);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) return true;
    }
    return false;
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('Report card design page', () => {
  test.use({ storageState: AUTH_STATES.tenant_admin });

  test.afterAll(async ({ request }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    await client.patch('/tenant/settings', { reportCard: DEFAULTS });
    await client.delete('/tenant/report-card/logo');
  });

  test('an administrator picks a layout, colour, logo and wording, and it survives a reload', async ({
    page,
  }) => {
    await page.goto('/tenant/report-card');
    await expect(page.getByRole('heading', { name: 'Report card design' })).toBeVisible();

    await page.getByRole('radio', { name: /Modern/ }).check();
    await page.locator('#report-card-accent').fill('#1a5c1a');
    await page.locator('#report-card-subtitle').fill('Affiliated to CBSE');
    await page.locator('#report-card-footer').fill('Khatima, Uttarakhand');
    await page.getByRole('button', { name: 'Add a signature' }).click();
    await page.locator('#report-card-signatory-2').fill('Vice Principal');
    await page.getByRole('checkbox', { name: 'Class rank' }).uncheck();

    await page.locator('input[type=file]').setInputFiles(LOGO);
    await expect(page.getByRole('button', { name: 'Replace logo' })).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Report card design saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('radio', { name: /Modern/ })).toBeChecked();
    await expect(page.locator('#report-card-accent')).toHaveValue('#1a5c1a');
    await expect(page.locator('#report-card-subtitle')).toHaveValue('Affiliated to CBSE');
    await expect(page.locator('#report-card-signatory-2')).toHaveValue('Vice Principal');
    await expect(page.getByRole('checkbox', { name: 'Class rank' })).not.toBeChecked();
    await expect(page.getByText(/A logo is set/)).toBeVisible();
  });

  test('a logo that is not a PNG or JPEG is refused before it is sent', async ({ page }) => {
    await page.goto('/tenant/report-card');
    let uploaded = false;
    page.on('request', (req) => {
      if (req.url().includes('/report-card/logo') && req.method() === 'POST') uploaded = true;
    });

    await page.locator('input[type=file]').setInputFiles({
      name: 'logo.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('GIF89a'),
    });
    await expect(page.getByRole('alert')).toContainText('PNG or JPEG');
    expect(uploaded).toBe(false);
  });

  test('the last signature cannot be removed or left blank', async ({ page }) => {
    await page.goto('/tenant/report-card');
    await page.locator('#report-card-signatory-2').waitFor();
    await page.getByRole('button', { name: 'Remove signature 3' }).click();
    await page.getByRole('button', { name: 'Remove signature 2' }).click();
    await expect(page.getByRole('button', { name: 'Remove signature 1' })).toBeDisabled();

    await page.locator('#report-card-signatory-0').fill('   ');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('at least one signature');
  });

  test('Preview draws a PDF built from the unsaved draft inside the page', async ({
    page,
    context,
  }) => {
    await page.goto('/tenant/report-card');
    await page.getByRole('radio', { name: /Compact/ }).check();

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/academic/report-card/preview')),
      page.getByRole('button', { name: 'Preview' }).click(),
    ]);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect((await response.body()).subarray(0, 4).toString()).toBe('%PDF');

    // Drawn in a dialog, not opened as a tab or a blob: link: the Android app
    // cannot open those ("No app on this device can open that link").
    const canvas = page.getByRole('dialog').getByRole('img', { name: 'Report card preview' });
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    expect(context.pages()).toHaveLength(1);
    expect(await hasInk(canvas)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Nothing was saved by previewing: a reload still shows the saved preset.
    await page.reload();
    await expect(page.getByRole('radio', { name: /Modern/ })).toBeChecked();
  });

  test('has no critical accessibility violations', async ({ page }) => {
    await page.goto('/tenant/report-card');
    await expect(page.getByRole('heading', { name: 'Report card design' })).toBeVisible();
    await injectAxe(page);
    await checkA11y(page, null, {
      detailedReport: true,
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
  });

  test('a batch generated after saving completes with the saved design', async ({ request }) => {
    const { section, term } = getTestIds();
    const client = await createTestApiClient(request, 'tenant_admin');

    const generate = await client.post('/academic/report-card/generate', {
      sectionId: section._id,
      termId: term._id,
    });
    expect(generate.ok()).toBe(true);
    const { jobId } = await generate.json();

    let state;
    for (let i = 0; i < 30; i++) {
      const res = await client.get(`/academic/report-card/status/${jobId}`);
      state = (await res.json()).state;
      if (state === 'completed' || state === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(state).toBe('completed');

    const history = await client.get(
      `/academic/report-card/history?sectionId=${section._id}&termId=${term._id}`
    );
    const batches = await history.json();
    expect(
      batches.some((b) => b.jobId === String(jobId) && b.status === 'completed' && b.url)
    ).toBe(true);
  });
});

test.describe('Report card design page — on a phone', () => {
  test.use({
    storageState: AUTH_STATES.tenant_admin,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test('Preview shows the card in the page, with no popup to hand to another app', async ({
    page,
    context,
  }) => {
    await page.goto('/tenant/report-card');
    await page.getByRole('button', { name: 'Preview' }).click();

    const canvas = page.getByRole('dialog').getByRole('img', { name: 'Report card preview' });
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    expect(context.pages()).toHaveLength(1);
    expect(await hasInk(canvas)).toBe(true);
    // The card fits the phone's width: no sideways scrolling inside the dialog.
    const box = await canvas.boundingBox();
    expect(box.width).toBeLessThanOrEqual(390);
  });
});

test.describe('Report card design page — access', () => {
  test.describe('teacher (can publish report cards, cannot administer the school)', () => {
    test.use({ storageState: AUTH_STATES.teacher });

    test('the page is refused and the nav has no link to it', async ({ page }) => {
      await page.goto('/tenant/report-card');
      await expect(page.getByText('You do not have access to this page')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Report card design' })).toHaveCount(0);
    });
  });

  test('the API refuses a teacher saving the design and a bad colour from an administrator', async ({
    request,
  }) => {
    const teacher = await createTestApiClient(request, 'teacher');
    expect(
      (await teacher.patch('/tenant/settings', { reportCard: { preset: 'modern' } })).status()
    ).toBe(403);

    const admin = await createTestApiClient(request, 'tenant_admin');
    expect(
      (await admin.patch('/tenant/settings', { reportCard: { accentColor: 'red' } })).status()
    ).toBe(400);
  });
});
