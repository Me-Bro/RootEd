import PDFDocument from 'pdfkit';
import { PROGRAMME_NAME } from '@rooted/shared/constants';

const fmtPct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const fmtDate = (d) => new Date(d).toISOString().slice(0, 10);

/**
 * Everything the report prints, as plain data. Kept apart from the drawing so
 * the figures can be asserted without parsing a PDF — and so the PDF cannot
 * show a number the dashboard does not.
 */
export function buildReportContent({ tenantName, batchName, term, metrics, generatedAt }) {
  const target = (t) => `${t}%`;
  const verdict = (m) => (m.pct === null ? '—' : m.met ? 'Met' : 'Not met');
  const { attendance, completion, project, mockInterview, improvement, placement } = metrics;

  return {
    title: `${PROGRAMME_NAME} — Batch Completion Report`,
    college: tenantName,
    batch: batchName,
    period: `${term.name} (${fmtDate(term.startDate)} to ${fmtDate(term.endDate)})`,
    generated: fmtDate(generatedAt),
    enrolled: metrics.enrolled,
    rows: [
      {
        label: 'Student attendance',
        value: fmtPct(attendance.pct),
        target: `at least ${target(attendance.target)}`,
        verdict: verdict(attendance),
      },
      {
        label: `Programme completion (${completion.completed} of ${completion.enrolled} enrolled)`,
        value: fmtPct(completion.pct),
        target: `at least ${target(completion.target)}`,
        verdict: verdict(completion),
      },
      {
        label: `Project completion (${project.completed} of ${project.eligible})`,
        value: fmtPct(project.pct),
        target: `at least ${target(project.target)}`,
        verdict: verdict(project),
      },
      {
        label: `Mock interviews completed (${mockInterview.completed} of ${mockInterview.eligible})`,
        value: fmtPct(mockInterview.pct),
        target: `at least ${target(mockInterview.target)}`,
        verdict: verdict(mockInterview),
      },
      {
        label: `Average score improvement (${improvement.studentsMeasured} students measured)`,
        value: improvement.avgDelta === null ? '—' : `${improvement.avgDelta} marks`,
        target: 'baseline vs final',
        verdict: '',
      },
    ],
    placement: [
      { label: 'Applied', value: placement.applied },
      { label: 'Interviewed', value: placement.interviewed },
      { label: 'Offered', value: placement.offered },
      { label: 'Joined', value: placement.joined },
    ],
    footnote:
      'Placement assistance is provided within the agreed scope. Employment is not guaranteed.',
  };
}

/** Writes the one-page report to `stream` (an HTTP response or any writable). */
export function renderReportPdf(stream, content) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(stream);

  doc.fontSize(18).text(content.title, { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor('#444');
  doc.text(`College: ${content.college}`);
  doc.text(`Batch: ${content.batch}`);
  doc.text(`Programme run: ${content.period}`);
  doc.text(`Students enrolled: ${content.enrolled}`);
  doc.text(`Generated: ${content.generated}`);
  doc.moveDown();

  doc.fillColor('#000').fontSize(13).text('Pilot success metrics');
  doc.moveDown(0.3);
  doc.fontSize(10);
  for (const row of content.rows) {
    doc.text(`${row.label}: ${row.value}   (target ${row.target})   ${row.verdict}`);
    doc.moveDown(0.2);
  }
  doc.moveDown();

  doc.fontSize(13).text('Placement progress');
  doc.moveDown(0.3);
  doc.fontSize(10);
  for (const row of content.placement) doc.text(`${row.label}: ${row.value}`);
  doc.moveDown();

  doc.fontSize(9).fillColor('#555').text(content.footnote);
  doc.end();
}
