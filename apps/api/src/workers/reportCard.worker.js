import { Worker } from 'bullmq';
import PDFDocument from 'pdfkit';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { Student } from '../models/Student.js';
import { Grade } from '../models/Grade.js';
import { uploadBuffer, getSignedUrl } from '../services/storage.service.js';

function scoreToLetter(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function generateReportCardPdf(tenantId, termId, sectionId) {
  const students = await Student.find({ tenantId, sectionId }).lean();
  const studentIds = students.map((s) => s._id);
  const grades = await Grade.find({ tenantId, termId, studentId: { $in: studentIds } })
    .populate('subjectId', 'name code')
    .lean();

  const gradesByStudent = {};
  for (const g of grades) {
    if (!gradesByStudent[g.studentId.toString()]) gradesByStudent[g.studentId.toString()] = [];
    gradesByStudent[g.studentId.toString()].push(g);
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      if (i > 0) doc.addPage();

      doc.fontSize(18).text('Report Card', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`${student.firstName} ${student.lastName}`);
      doc.text(`Admission No: ${student.admissionNo}`);
      doc.moveDown();

      const studentGrades = gradesByStudent[student._id.toString()] || [];
      doc.fontSize(10);
      doc.text('Subject', 50, doc.y, { continued: false, width: 200 });

      const tableTop = doc.y;
      doc.text('Subject', 50, tableTop, { width: 200 });
      doc.text('Score', 260, tableTop, { width: 80 });
      doc.text('Grade', 350, tableTop, { width: 80 });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
      doc.moveDown(0.5);

      let totalWeightedScore = 0;
      let totalWeight = 0;

      for (const g of studentGrades) {
        const y = doc.y;
        const letter = g.letterGrade || scoreToLetter(g.score ?? 0);
        doc.text(g.subjectId?.name ?? 'Unknown', 50, y, { width: 200 });
        doc.text(String(g.score ?? '—'), 260, y, { width: 80 });
        doc.text(letter, 350, y, { width: 80 });
        doc.moveDown(0.5);
        totalWeightedScore += (g.score ?? 0) * (g.weightage ?? 1);
        totalWeight += g.weightage ?? 1;
      }

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
      doc.moveDown(0.5);

      const avg = totalWeight > 0 ? (totalWeightedScore / totalWeight).toFixed(2) : '—';
      doc.fontSize(11).text(`Weighted Average: ${avg}`, { align: 'right' });
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

      return { url };
    },
    { connection: redis, concurrency: 2 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Report card job failed');
  });

  logger.info('Report card worker started');
  return worker;
}
