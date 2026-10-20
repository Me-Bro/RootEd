import { PassThrough } from 'stream';
import { PROGRAMME_NAME } from '@rooted/shared/constants';
import { computeBatch } from '../utils/trainingMetrics.js';
import { buildReportContent, renderReportPdf } from '../services/trainingReport.service.js';

const { metrics } = computeBatch({
  members: [
    { studentId: 'a', status: 'completed' },
    { studentId: 'b', status: 'active' },
  ],
  attendance: [
    { entityId: 'a', status: 'present' },
    { entityId: 'a', status: 'present' },
    { entityId: 'a', status: 'present' },
    { entityId: 'a', status: 'absent' },
  ],
  grades: [],
  assignments: [],
  submissions: [],
  projects: [],
  placements: [{ studentId: 'a', stage: 'applied', appliedAt: new Date('2026-10-01') }],
});

const content = buildReportContent({
  tenantName: 'Doon College',
  batchName: 'BCA Sem 5 — Batch A',
  term: { name: 'Run 1', startDate: new Date('2026-09-01'), endDate: new Date('2026-12-01') },
  metrics,
  generatedAt: new Date('2026-12-05'),
});

test('is titled with the programme name', () => {
  expect(content.title).toBe(`${PROGRAMME_NAME} — Batch Completion Report`);
  expect(content.title).toContain('RR Cloud Career Catalyst');
});

test('carries the same figures the dashboard shows, with a verdict per target', () => {
  const byLabel = Object.fromEntries(content.rows.map((r) => [r.label.split(' (')[0], r]));
  expect(byLabel['Student attendance']).toMatchObject({
    value: '75%',
    target: 'at least 80%',
    verdict: 'Not met',
  });
  expect(byLabel['Programme completion']).toMatchObject({ value: '50%', verdict: 'Not met' });
});

test('shows a dash, not 0%, where nothing could be measured', () => {
  const byLabel = Object.fromEntries(content.rows.map((r) => [r.label.split(' (')[0], r]));
  expect(byLabel['Project completion'].value).toBe('0%');
  expect(byLabel['Average score improvement'].value).toBe('—');
});

test('lists each placement stage on its own', () => {
  expect(content.placement).toEqual([
    { label: 'Applied', value: 1 },
    { label: 'Interviewed', value: 0 },
    { label: 'Offered', value: 0 },
    { label: 'Joined', value: 0 },
  ]);
});

test('does not promise employment', () => {
  expect(content.footnote).toMatch(/not guaranteed/i);
});

test('renders a PDF', async () => {
  const sink = new PassThrough();
  const chunks = [];
  sink.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => sink.on('end', resolve));
  renderReportPdf(sink, content);
  await done;
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.length).toBeGreaterThan(500);
});
