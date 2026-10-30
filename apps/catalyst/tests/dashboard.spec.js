import { test, expect } from '@playwright/test';
import { AUTH_STATES } from './fixtures/auth.js';
import { expected } from './fixtures/seed.js';

// Every figure is the hand-worked value the seed writes under training.expected
// (see the comment next to it in seed-test-data.js), not one recomputed here.
test.describe('batch dashboard', () => {
  test.use({ storageState: AUTH_STATES.teacher });

  test('shows each pilot figure against its target', async ({ page }) => {
    const e = expected();
    await page.goto('/dashboard');

    await expect(page.getByTestId('enrolled-count')).toContainText(
      `${e.enrolled} students enrolled, ${e.active} still on the programme`
    );
    await expect(page.getByTestId('metric-attendance-value')).toHaveText(`${e.attendancePct}%`);
    await expect(page.getByTestId('metric-attendance')).toContainText('Target met');
    await expect(page.getByTestId('metric-attendance')).toContainText(
      `${e.attendanceBelowTarget} students below the attendance target`
    );

    await expect(page.getByTestId('metric-completion-value')).toHaveText(`${e.completionPct}%`);
    await expect(page.getByTestId('metric-completion')).toContainText('Below target');
    await expect(page.getByTestId('metric-completion')).toContainText(
      `${e.completed} of ${e.enrolled} enrolled completed · ${e.dropped} left`
    );

    await expect(page.getByTestId('metric-project-value')).toHaveText(`${e.projectPct}%`);
    await expect(page.getByTestId('metric-mock-value')).toHaveText(`${e.mockPct}%`);
    await expect(page.getByTestId('improvement-value')).toHaveText(`+${e.avgDelta} marks`);
    await expect(page.getByTestId('metric-improvement')).toContainText(
      `${e.studentsMeasured} students measured`
    );
  });

  test('reports each placement stage on its own', async ({ page }) => {
    const { placement } = expected();
    await page.goto('/dashboard');
    for (const stage of ['applied', 'interviewed', 'offered', 'joined']) {
      await expect(page.getByTestId(`placement-${stage}`)).toHaveText(String(placement[stage]));
    }
    await expect(page.getByTestId('metric-placement')).toContainText(
      `${placement.rejected} students rejected by an employer`
    );
  });

  test('downloads the completion report as a PDF', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('metric-attendance-value')).toBeVisible();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download report (PDF)' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('completion-report.pdf');
    const { readFileSync } = await import('fs');
    expect(
      readFileSync(await file.path())
        .subarray(0, 4)
        .toString()
    ).toBe('%PDF');
  });

  test('a batch with nobody in it shows dashes, not zeros', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('metric-attendance-value')).toBeVisible();
    // Section B of the seeded class has no students.
    await page.getByLabel('Batch').selectOption({ label: 'Grade 5 — B' });
    await expect(page.getByTestId('enrolled-count')).toContainText('0 students enrolled');
    await expect(page.getByTestId('metric-attendance-value')).toHaveText('—');
    await expect(page.getByTestId('metric-completion-value')).toHaveText('—');
    await expect(page.getByTestId('metric-completion')).toContainText('No data yet');
  });
});

test.describe('the TPO reads the same dashboard', () => {
  test.use({ storageState: AUTH_STATES.principal });

  test('sees the figures and the report button', async ({ page }) => {
    const e = expected();
    await page.goto('/dashboard');
    await expect(page.getByTestId('metric-completion-value')).toHaveText(`${e.completionPct}%`);
    await expect(page.getByRole('button', { name: 'Download report (PDF)' })).toBeEnabled();
  });
});
