import PDFDocument from 'pdfkit';

// A4 in points; every preset draws inside 50pt margins.
const PAGE_W = 595.28;
const LEFT = 50;
const RIGHT = 545;
const CONTENT_W = RIGHT - LEFT;

// ── Colour helpers ───────────────────────────────────────────────────────────

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Mix a colour toward white: t=0 is the colour, t=1 is white.
export function tint(hex, t) {
  const out = rgb(hex).map((c) => Math.round(c + (255 - c) * t));
  return `#${out.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// Text colour that stays readable on top of a filled accent.
export function readableOn(hex) {
  const [r, g, b] = rgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000000' : '#ffffff';
}

// Accent used for text on a light background: the accent itself unless it is too
// pale to read, then black.
const inkFor = (accent) => (readableOn(accent) === '#ffffff' ? accent : '#000000');

// ── Shared pieces ────────────────────────────────────────────────────────────

// x-ranges of the signature lines. Two slots are the original layout.
export function signatureSlots(n) {
  if (n <= 1) return [[225, 365]];
  if (n === 2) {
    return [
      [80, 220],
      [340, 480],
    ];
  }
  return [
    [60, 190],
    [230, 360],
    [400, 530],
  ];
}

function drawSignatures(doc, y, labels, fontSize) {
  const slots = signatureSlots(labels.length);
  doc.fontSize(fontSize);
  slots.forEach(([x0, x1]) => doc.moveTo(x0, y).lineTo(x1, y).stroke());
  slots.forEach(([x0, x1], i) =>
    doc.text(labels[i], x0, y + 5, { width: x1 - x0, align: 'center' })
  );
}

function drawFooter(doc, pageNum, pageCount, config) {
  const bottom = doc.page.height - doc.page.margins.bottom + 10;
  // The footer sits inside the bottom margin; pdfkit starts a new page for any
  // text below maxY (height - margins.bottom), so zero it while drawing.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  if (config.footerText) {
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('gray')
      .text(config.footerText, LEFT, bottom - 12, { width: CONTENT_W, align: 'center' });
  }
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('gray')
    .text(config.gradingLegend, LEFT, bottom, { width: 340 })
    .text(`Page ${pageNum} of ${pageCount}`, 400, bottom, { width: 140, align: 'right' })
    .fillColor('black');
  doc.page.margins.bottom = savedBottom;
}

// logo is a pdfkit image opened once per document; the fit box keeps a tall or
// wide logo from pushing the layout around.
function drawLogo(doc, logo, x, y, size) {
  if (!logo) return;
  doc.image(logo, x, y, { fit: [size, size], align: 'center', valign: 'center' });
}

const assessmentLabel = (g) => {
  const subjectLabel = g.subjectId?.name ?? 'Unknown';
  return g.assessmentType && g.assessmentType !== 'final'
    ? `${subjectLabel} (${g.assessmentType[0].toUpperCase()}${g.assessmentType.slice(1)})`
    : subjectLabel;
};

// Fixed-height cell: one line, cut with an ellipsis, so a long remark never
// changes the row height.
function cell(doc, str, x, y, width, size) {
  doc.fontSize(size).text(str, x, y, { width, height: size * 1.25, ellipsis: true });
}

const rowHeight = (avail, rows, min, max) =>
  rows === 0 ? max : Math.max(min, Math.min(max, Math.floor(avail / rows)));

// ── Classic: the original look ───────────────────────────────────────────────

function drawClassic(doc, ctx, config, logo) {
  const { student, grades, sectionLabel, termLabel } = ctx;

  if (logo) drawLogo(doc, logo, LEFT, 40, 60);
  // With a logo on the left, the title block is centred in the space beside it.
  const headOpts = logo ? { align: 'center', width: 355 } : { align: 'center' };
  if (logo) doc.x = 120;

  doc.fillColor(config.accentColor);
  doc.fontSize(16).text(config.schoolName, headOpts);
  doc.fillColor('black');
  doc.fontSize(12).text('Report Card', headOpts);
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('gray').text(`${sectionLabel}  ·  ${termLabel}`, headOpts);
  doc.fillColor('black');
  if (config.subtitle) {
    doc.fontSize(9).fillColor('gray').text(config.subtitle, headOpts);
    doc.fillColor('black');
  }
  doc.x = doc.page.margins.left;
  if (logo && doc.y < 106) doc.y = 106;
  doc.moveDown(0.8);

  doc.fontSize(12).text(`${student.firstName} ${student.lastName}`);
  doc.fontSize(10).text(`Admission No: ${student.admissionNo}`);
  doc.moveDown();

  const tableTop = doc.y;
  doc.fontSize(10);
  doc.text('Subject', 50, tableTop, { width: 150 });
  doc.text('Score', 200, tableTop, { width: 60 });
  doc.text('Grade', 260, tableTop, { width: 60 });
  doc.text('Remarks', 320, tableTop, { width: 220 });
  doc.moveDown(0.5);
  doc.strokeColor(config.accentColor).moveTo(50, doc.y).lineTo(540, doc.y).stroke();
  doc.moveDown(0.5);

  for (const g of grades) {
    const y = doc.y;
    doc.text(assessmentLabel(g), 50, y, { width: 150 });
    doc.text(String(g.score ?? '—'), 200, y, { width: 60 });
    doc.text(g.letterGrade || '—', 260, y, { width: 60 });
    doc.text(g.remarks ?? '—', 320, y, { width: 220 });
    doc.moveDown(0.5);
  }

  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
  doc.strokeColor('black');
  doc.moveDown(0.5);

  doc.fontSize(11);
  doc.text(`Weighted Average: ${ctx.avg}   Overall Grade: ${ctx.overallLetter}`, {
    align: 'right',
  });
  if (config.showRank) doc.text(`Class Rank: ${ctx.rankLabel}`, { align: 'right' });
  if (config.showAttendance) doc.text(`Attendance: ${ctx.attendanceLabel}`, { align: 'right' });

  drawSignatures(doc, doc.y + 30, config.signatories, 10);
}

// ── Modern: colour band, shaded table, summary tiles ─────────────────────────

function drawModern(doc, ctx, config, logo) {
  const { student, grades, sectionLabel, termLabel } = ctx;
  const accent = config.accentColor;
  const onAccent = readableOn(accent);

  doc.rect(0, 0, PAGE_W, 96).fill(accent);
  if (logo) {
    // A dark logo would vanish on a dark band, so it sits on a white tile.
    doc.roundedRect(LEFT, 16, 64, 64, 4).fill('#ffffff');
    drawLogo(doc, logo, LEFT + 2, 18, 60);
  }
  const textX = logo ? 124 : LEFT;
  const textW = RIGHT - textX;
  doc.fillColor(onAccent).font('Helvetica-Bold');
  doc.fontSize(18).text(config.schoolName, textX, 18, { width: textW, height: 22, ellipsis: true });
  doc.font('Helvetica').fontSize(11).text('Report Card', textX, 44, { width: textW });
  doc.fontSize(9).text(`${sectionLabel}  ·  ${termLabel}`, textX, 60, { width: textW });
  if (config.subtitle) {
    doc.fontSize(9).text(config.subtitle, textX, 74, { width: textW, height: 12, ellipsis: true });
  }

  doc.rect(LEFT, 108, CONTENT_W, 42).fill(tint(accent, 0.92));
  doc.fillColor('#000000').font('Helvetica-Bold');
  cell(doc, `${student.firstName} ${student.lastName}`, 62, 118, CONTENT_W - 24, 13);
  doc.font('Helvetica').fillColor('#444444');
  cell(doc, `Admission No: ${student.admissionNo}`, 62, 135, CONTENT_W - 24, 9);

  const headY = 162;
  doc.rect(LEFT, headY, CONTENT_W, 20).fill(accent);
  doc.fillColor(onAccent).font('Helvetica-Bold');
  cell(doc, 'Subject', 58, headY + 6, 160, 9);
  cell(doc, 'Score', 224, headY + 6, 56, 9);
  cell(doc, 'Grade', 284, headY + 6, 56, 9);
  cell(doc, 'Remarks', 344, headY + 6, 196, 9);

  const rowsTop = headY + 20;
  const rowH = rowHeight(673 - rowsTop, grades.length, 12, 20);
  doc.font('Helvetica');
  grades.forEach((g, i) => {
    const y = rowsTop + i * rowH;
    if (i % 2 === 1) doc.rect(LEFT, y, CONTENT_W, rowH).fill(tint(accent, 0.94));
    const ty = y + Math.max(1, (rowH - 10) / 2);
    doc.fillColor('#222222');
    cell(doc, assessmentLabel(g), 58, ty, 160, 9);
    cell(doc, String(g.score ?? '—'), 224, ty, 56, 9);
    cell(doc, g.letterGrade || '—', 284, ty, 56, 9);
    cell(doc, g.remarks ?? '—', 344, ty, 196, 9);
  });

  const tiles = [
    ['Weighted Average', String(ctx.avg)],
    ['Overall Grade', String(ctx.overallLetter)],
  ];
  if (config.showRank) tiles.push(['Class Rank', ctx.rankShort]);
  if (config.showAttendance) tiles.push(['Attendance', ctx.attendanceLabel]);

  const tileY = rowsTop + grades.length * rowH + 14;
  const gap = 8;
  const tileW = (CONTENT_W - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([label, value], i) => {
    const x = LEFT + i * (tileW + gap);
    doc.rect(x, tileY, tileW, 46).fill(tint(accent, 0.92));
    doc.fillColor('#555555').font('Helvetica');
    cell(doc, label, x + 8, tileY + 8, tileW - 16, 8);
    doc.fillColor(inkFor(accent)).font('Helvetica-Bold');
    cell(doc, value, x + 8, tileY + 22, tileW - 16, 14);
  });

  doc.fillColor('#000000').font('Helvetica').strokeColor('#000000');
  drawSignatures(doc, tileY + 46 + 40, config.signatories, 10);
}

// ── Compact: small type, one-line header, tight rows ─────────────────────────

function drawCompact(doc, ctx, config, logo) {
  const { student, grades, sectionLabel, termLabel } = ctx;
  const accent = config.accentColor;

  drawLogo(doc, logo, LEFT, 36, 40);
  const textX = logo ? 98 : LEFT;
  const textW = RIGHT - textX;
  doc.fillColor('#000000').font('Helvetica-Bold');
  cell(doc, config.schoolName, textX, 38, textW, 13);
  doc.font('Helvetica').fillColor('#555555');
  cell(doc, `Report Card  ·  ${sectionLabel}  ·  ${termLabel}`, textX, 55, textW, 8);
  if (config.subtitle) cell(doc, config.subtitle, textX, 66, textW, 8);
  doc.lineWidth(1.5).strokeColor(accent).moveTo(LEFT, 82).lineTo(RIGHT, 82).stroke();
  doc.lineWidth(1);

  doc.fillColor('#000000').font('Helvetica-Bold');
  cell(doc, `${student.firstName} ${student.lastName}`, LEFT, 90, 280, 10);
  doc.font('Helvetica');
  doc.fontSize(9).text(`Admission No: ${student.admissionNo}`, 330, 91, {
    width: RIGHT - 330,
    height: 12,
    align: 'right',
    ellipsis: true,
  });

  const headY = 110;
  doc.font('Helvetica-Bold');
  cell(doc, 'Subject', LEFT + 2, headY, 170, 8);
  cell(doc, 'Score', 226, headY, 50, 8);
  cell(doc, 'Grade', 280, headY, 50, 8);
  cell(doc, 'Remarks', 334, headY, 206, 8);
  doc
    .lineWidth(0.75)
    .strokeColor(accent)
    .moveTo(LEFT, headY + 13)
    .lineTo(RIGHT, headY + 13)
    .stroke();

  const rowsTop = headY + 16;
  const rowH = rowHeight(720 - rowsTop, grades.length, 10, 14);
  doc.font('Helvetica').lineWidth(0.25).strokeColor('#bbbbbb');
  grades.forEach((g, i) => {
    const y = rowsTop + i * rowH;
    const ty = y + Math.max(0.5, (rowH - 9) / 2);
    doc.fillColor('#222222');
    cell(doc, assessmentLabel(g), LEFT + 2, ty, 170, 8);
    cell(doc, String(g.score ?? '—'), 226, ty, 50, 8);
    cell(doc, g.letterGrade || '—', 280, ty, 50, 8);
    cell(doc, g.remarks ?? '—', 334, ty, 206, 8);
    doc
      .moveTo(LEFT, y + rowH)
      .lineTo(RIGHT, y + rowH)
      .stroke();
  });

  const parts = [`Average: ${ctx.avg}`, `Grade: ${ctx.overallLetter}`];
  if (config.showRank) parts.push(`Rank: ${ctx.rankShort}`);
  if (config.showAttendance) parts.push(`Attendance: ${ctx.attendanceLabel}`);
  const sumY = rowsTop + grades.length * rowH + 10;
  doc.lineWidth(1).strokeColor('#000000').fillColor('#000000').font('Helvetica-Bold');
  doc.fontSize(9).text(parts.join('  ·  '), LEFT, sumY, { width: CONTENT_W, height: 12 });

  doc.font('Helvetica');
  drawSignatures(doc, sumY + 14 + 28, config.signatories, 8);
}

const LAYOUTS = { classic: drawClassic, modern: drawModern, compact: drawCompact };

// ── Document ─────────────────────────────────────────────────────────────────

function resetState(doc) {
  doc.font('Helvetica').fontSize(12).fillColor('black').strokeColor('black').lineWidth(1);
}

function cardContext(input, student, index) {
  const key = student._id.toString();
  const stats = input.gradeStatsByStudent[key];
  const attendance = input.attendanceByStudent[key];
  const ranked = stats?.rank != null;
  return {
    student,
    grades: input.gradesByStudent[key] || [],
    sectionLabel: input.sectionLabel,
    termLabel: input.termLabel,
    index,
    total: input.students.length,
    avg: stats?.score ?? '—',
    overallLetter: stats?.letterGrade ?? '—',
    rankLabel: ranked ? `${stats.rank} of ${input.rankedCount}` : 'Not ranked (no scored subjects)',
    rankShort: ranked ? `${stats.rank} of ${input.rankedCount}` : 'Not ranked',
    attendanceLabel: attendance?.pct != null ? `${attendance.pct}%` : 'No records',
  };
}

/**
 * Renders one card per student into a single PDF and resolves with its bytes.
 * Pure of Redis and Mongo so it can be tested (and previewed) on its own.
 *
 * input: { students, sectionLabel, termLabel, gradesByStudent, gradeStatsByStudent,
 *          attendanceByStudent, rankedCount, config (resolveReportCardConfig),
 *          logo (Buffer | null), onProgress ({ completed, total }) => Promise }
 */
export function renderReportCardPdf(input) {
  const { students, config, onProgress } = input;
  const draw = LAYOUTS[config.preset] ?? drawClassic;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Wrapped in an async IIFE so each iteration can await the progress callback;
    // pdfkit's own data/end/error events still drive resolve/reject above.
    (async () => {
      // Opened once so the logo is embedded once, not once per student.
      let logo = null;
      if (input.logo) {
        try {
          logo = doc.openImage(input.logo);
        } catch {
          logo = null; // an undecodable logo is skipped, never fails the batch
        }
      }

      await onProgress?.({ completed: 0, total: students.length });

      for (let i = 0; i < students.length; i++) {
        if (i > 0) doc.addPage();
        resetState(doc);
        draw(doc, cardContext(input, students[i], i), config, logo);
        drawFooter(doc, i + 1, students.length, config);
        await onProgress?.({ completed: i + 1, total: students.length });
      }

      if (students.length === 0) {
        doc.fontSize(12).text('No active students in this section.');
      }

      doc.end();
    })().catch(reject);
  });
}
