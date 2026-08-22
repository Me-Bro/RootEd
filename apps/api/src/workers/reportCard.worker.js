import { Worker } from 'bullmq';
import PDFDocument from 'pdfkit';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { Student } from '../models/Student.js';
import { Grade } from '../models/Grade.js';
import { AttendanceRecord } from '../models/AttendanceRecord.js';
import { Section } from '../models/Section.js';
import { Term } from '../models/Term.js';
import { Tenant } from '../models/Tenant.js';
import { ReportCardBatch } from '../models/ReportCardBatch.js';
import { computeGradeStats } from '../utils/gradeStats.js';
import { computeAttendanceStats } from '../utils/attendanceStats.js';
import { uploadBuffer, getSignedUrl } from '../services/storage.service.js';

const ATTENDANCE_THRESHOLD_PCT = 75;
const GRADING_SCALE_LEGEND =
  'Grading Scale:  A 90-100  ·  B 80-89  ·  C 70-79  ·  D 60-69  ·  F Below 60';

async function loadReportCardData(tenantId, termId, sectionId) {
  const [section, term, tenant] = await Promise.all([
    Section.findOne({ _id: sectionId, tenantId }).populate('classId', 'name').lean(),
    Term.findOne({ _id: termId, tenantId }).lean(),
    Tenant.findById(tenantId).lean(),
  ]);

  const students = await Student.find({ tenantId, sectionId, status: 'active' }).lean();
  const studentIds = students.map((s) => s._id);

  const [grades, attendanceRecords] = await Promise.all([
    Grade.find({ tenantId, termId, studentId: { $in: studentIds } })
      .populate('subjectId', 'name code')
      .lean(),
    AttendanceRecord.find({
      tenantId,
      sectionId,
      entityType: 'student',
      entityId: { $in: studentIds },
      date: { $gte: term.startDate, $lte: term.endDate },
    }).lean(),
  ]);

  const gradesByStudent = {};
  for (const g of grades) {
    const key = g.studentId.toString();
    if (!gradesByStudent[key]) gradesByStudent[key] = [];
    gradesByStudent[key].push(g);
  }

  const gradeStats = computeGradeStats(students, grades);
  const attendanceStats = computeAttendanceStats(
    students,
    attendanceRecords,
    ATTENDANCE_THRESHOLD_PCT
  );
  const attendanceByStudent = Object.fromEntries(
    attendanceStats.students.map((s) => [s.studentId, s])
  );
  const gradeStatsByStudent = Object.fromEntries(gradeStats.students.map((s) => [s.studentId, s]));

  return {
    section,
    term,
    tenant,
    students,
    gradesByStudent,
    gradeStatsByStudent,
    attendanceByStudent,
    rankedCount: gradeStats.rankedCount,
  };
}

function drawFooter(doc, pageNum, pageCount) {
  const bottom = doc.page.height - doc.page.margins.bottom + 10;
  doc
    .fontSize(7)
    .fillColor('gray')
    .text(GRADING_SCALE_LEGEND, 50, bottom, { width: 340 })
    .text(`Page ${pageNum} of ${pageCount}`, 400, bottom, { width: 140, align: 'right' })
    .fillColor('black');
}

function drawSignatureLines(doc) {
  const y = doc.y + 30;
  doc
    .fontSize(10)
    .moveTo(80, y)
    .lineTo(220, y)
    .stroke()
    .moveTo(340, y)
    .lineTo(480, y)
    .stroke()
    .text('Class Teacher', 80, y + 5, { width: 140, align: 'center' })
    .text('Principal', 340, y + 5, { width: 140, align: 'center' });
}

async function generateReportCardPdf(tenantId, termId, sectionId) {
  const {
    section,
    term,
    tenant,
    students,
    gradesByStudent,
    gradeStatsByStudent,
    attendanceByStudent,
    rankedCount,
  } = await loadReportCardData(tenantId, termId, sectionId);

  const sectionLabel = section?.classId?.name
    ? `${section.classId.name} - ${section.name}`
    : (section?.name ?? '—');
  const termLabel = term?.name ?? '—';
  const schoolName = tenant?.name ?? 'Report Card';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      if (i > 0) doc.addPage();

      doc.fontSize(16).text(schoolName, { align: 'center' });
      doc.fontSize(12).text('Report Card', { align: 'center' });
      doc.moveDown(0.3);
      doc
        .fontSize(9)
        .fillColor('gray')
        .text(`${sectionLabel}  ·  ${termLabel}`, { align: 'center' });
      doc.fillColor('black');
      doc.moveDown(0.8);

      doc.fontSize(12).text(`${student.firstName} ${student.lastName}`);
      doc.fontSize(10).text(`Admission No: ${student.admissionNo}`);
      doc.moveDown();

      const studentGrades = gradesByStudent[student._id.toString()] || [];

      const tableTop = doc.y;
      doc.fontSize(10);
      doc.text('Subject', 50, tableTop, { width: 150 });
      doc.text('Score', 200, tableTop, { width: 60 });
      doc.text('Grade', 260, tableTop, { width: 60 });
      doc.text('Remarks', 320, tableTop, { width: 220 });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
      doc.moveDown(0.5);

      for (const g of studentGrades) {
        const y = doc.y;
        const letter = g.letterGrade || '—';
        const subjectLabel = g.subjectId?.name ?? 'Unknown';
        const assessmentLabel =
          g.assessmentType && g.assessmentType !== 'final'
            ? `${subjectLabel} (${g.assessmentType[0].toUpperCase()}${g.assessmentType.slice(1)})`
            : subjectLabel;
        doc.text(assessmentLabel, 50, y, { width: 150 });
        doc.text(String(g.score ?? '—'), 200, y, { width: 60 });
        doc.text(letter, 260, y, { width: 60 });
        doc.text(g.remarks ?? '—', 320, y, { width: 220 });
        doc.moveDown(0.5);
      }

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
      doc.moveDown(0.5);

      const stats = gradeStatsByStudent[student._id.toString()];
      const attendance = attendanceByStudent[student._id.toString()];
      const avg = stats?.score ?? '—';
      const overallLetter = stats?.letterGrade ?? '—';
      const rankLabel =
        stats?.rank != null ? `${stats.rank} of ${rankedCount}` : 'Not ranked (no scored subjects)';
      const attendanceLabel = attendance?.pct != null ? `${attendance.pct}%` : 'No records';

      doc.fontSize(11);
      doc.text(`Weighted Average: ${avg}   Overall Grade: ${overallLetter}`, { align: 'right' });
      doc.text(`Class Rank: ${rankLabel}`, { align: 'right' });
      doc.text(`Attendance: ${attendanceLabel}`, { align: 'right' });

      drawSignatureLines(doc);
      drawFooter(doc, i + 1, students.length);
    }

    if (students.length === 0) {
      doc.fontSize(12).text('No active students in this section.');
    }

    doc.end();
  });
}

export function startReportCardWorker() {
  const worker = new Worker(
    'report-card',
    async (job) => {
      const { tenantId, termId, sectionId } = job.data;

      const pdfBuffer = await generateReportCardPdf(tenantId, termId, sectionId);
      const key = `report-cards/${tenantId}/${termId}/${sectionId}/${Date.now()}.pdf`;

      await uploadBuffer(key, pdfBuffer, 'application/pdf');
      const url = await getSignedUrl(key, 3600);

      await ReportCardBatch.updateOne(
        { jobId: job.id, tenantId },
        { $set: { status: 'completed', s3Key: key } }
      );

      return { url };
    },
    { connection: redis, concurrency: 2 }
  );

  worker.on('failed', async (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Report card job failed');
    if (!job) return;
    try {
      await ReportCardBatch.updateOne(
        { jobId: job.id, tenantId: job.data?.tenantId },
        { $set: { status: 'failed', error: err?.message ?? 'Unknown error' } }
      );
    } catch (updateErr) {
      logger.error({ jobId: job.id, err: updateErr }, 'Failed to record report card job failure');
    }
  });

  logger.info('Report card worker started');
  return worker;
}
