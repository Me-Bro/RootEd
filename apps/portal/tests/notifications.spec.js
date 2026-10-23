import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';

test.describe('notification bell', () => {
  test.use({ storageState: AUTH_STATES.student });

  test('shows unread notices and clears them on "mark all read"', async ({ page }) => {
    let unread = [
      {
        _id: 'n1',
        title: 'New assignment',
        body: 'Quiz 1 is due on 2026-11-01.',
        createdAt: '2026-10-23T08:00:00Z',
      },
    ];
    await page.route('**/tenant/notifications', (route) => route.fulfill({ json: unread }));
    await page.route('**/tenant/notifications/*/read', (route) => {
      unread = [];
      return route.fulfill({ json: {} });
    });

    await page.goto('/me/progress');
    await expect(page.getByTestId('notification-count')).toHaveText('1');

    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByText('Quiz 1 is due on 2026-11-01.')).toBeVisible();

    await page.getByRole('button', { name: 'Mark all read' }).click();
    await expect(page.getByText('No new notifications')).toBeVisible();
    await expect(page.getByTestId('notification-count')).toHaveCount(0);
  });
});
