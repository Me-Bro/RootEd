import { test, expect } from '@playwright/test';
import { createTestApiClient, createStudent } from '../fixtures/data.js';

// A minimal valid 1x1 PNG, used to exercise the image-only photo endpoint.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

test.describe('Student documents and photo', () => {
  test('uploads a document and downloads it', async ({ page, request }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    const student = await createStudent(client, { firstName: 'DocsUpload' });

    await page.goto(`/academic/students/${student._id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('No documents uploaded.')).toBeVisible();

    await page.locator('input[type="file"]:not([accept])').setInputFiles({
      name: 'birth-certificate.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test document'),
    });

    await expect(page.getByText('birth-certificate.pdf')).toBeVisible({ timeout: 10_000 });

    // The presigned URL responds with a PDF, which Chromium treats as a
    // download rather than a navigation — assert via the `download` event,
    // not the popup page's url().
    const [download] = await Promise.all([
      page.context().waitForEvent('download'),
      page.getByRole('button', { name: 'Download' }).click(),
    ]);
    expect(download.url()).toContain('birth-certificate.pdf');
  });

  test('uploads a photo and shows it in place of the initials fallback', async ({
    page,
    request,
  }) => {
    const client = await createTestApiClient(request, 'tenant_admin');
    const student = await createStudent(client, { firstName: 'PhotoUpload', lastName: 'Test' });

    await page.goto(`/academic/students/${student._id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('PT', { exact: true })).toBeVisible();

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });

    await expect(page.getByRole('button', { name: 'Change Photo' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-slot="avatar-image"]')).toBeVisible();
  });

  test.describe('permission gating', () => {
    test.use({ storageState: 'tests/fixtures/.auth/teacher.json' });

    test('read-only role sees documents/photo but not upload controls', async ({
      page,
      request,
    }) => {
      const client = await createTestApiClient(request, 'tenant_admin');
      const student = await createStudent(client, { firstName: 'ReadOnlyView' });

      await page.goto(`/academic/students/${student._id}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
      await expect(page.getByText('No documents uploaded.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Upload Document' })).not.toBeVisible();
      await expect(page.getByRole('button', { name: 'Upload Photo' })).not.toBeVisible();
    });
  });
});
