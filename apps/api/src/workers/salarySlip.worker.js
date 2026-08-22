import { Worker } from 'bullmq';
import PDFDocument from 'pdfkit';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { SalarySlip } from '../models/SalarySlip.js';
import { uploadBuffer } from '../services/storage.service.js';
import { loadStaffAndStructure, computeSalarySlip } from '../services/salary.service.js';

async function generateSalarySlipPdf(staff, plaintextSlip, month, year) {
  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('Salary Slip', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`${staff.firstName} ${staff.lastName}`);
    if (staff.employeeId) doc.text(`Employee ID: ${staff.employeeId}`);
    if (staff.designation) doc.text(`Designation: ${staff.designation}`);
    if (staff.department) doc.text(`Department: ${staff.department}`);
    doc.text(`Period: ${monthName} ${year}`);
    doc.moveDown();

    const tableTop = doc.y;
    doc.fontSize(10).text('Component', 50, tableTop, { width: 250 });
    doc.text('Type', 310, tableTop, { width: 100 });
    doc.text('Amount', 420, tableTop, { width: 100 });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(0.5);

    for (const comp of plaintextSlip.components) {
      const y = doc.y;
      doc.text(comp.label, 50, y, { width: 250 });
      doc.text(comp.type, 310, y, { width: 100 });
      doc.text(comp.amount.toFixed(2), 420, y, { width: 100 });
      doc.moveDown(0.5);
    }

    doc.moveTo(50, doc.y).lineTo(540, doc.y).stroke();
    doc.moveDown(0.5);
    doc
      .fontSize(11)
      .text(`Gross Earnings: ${plaintextSlip.grossEarnings.toFixed(2)}`, { align: 'right' });
    doc.text(`Total Deductions: ${plaintextSlip.totalDeductions.toFixed(2)}`, { align: 'right' });
    doc.fontSize(13).text(`Net Pay: ${plaintextSlip.netPay.toFixed(2)}`, { align: 'right' });

    doc.end();
  });
}

export function startSalarySlipWorker() {
  const worker = new Worker(
    'salary-slip',
    async (job) => {
      const { tenantId, month, year, staffIds } = job.data;
      const succeeded = [];
      const failed = [];

      for (const staffId of staffIds) {
        try {
          const { staff, structure } = await loadStaffAndStructure(tenantId, staffId);
          const { plaintext, encrypted } = computeSalarySlip(structure, tenantId);

          const pdfBuffer = await generateSalarySlipPdf(staff, plaintext, month, year);
          const pdfKey = `salary-slips/${tenantId}/${staffId}/${year}-${month}.pdf`;
          await uploadBuffer(pdfKey, pdfBuffer, 'application/pdf');

          await SalarySlip.findOneAndUpdate(
            { tenantId, staffId, month, year },
            { $set: { ...encrypted, pdfKey, status: 'generated', error: null } },
            { upsert: true }
          );
          succeeded.push(staffId);
        } catch (err) {
          logger.error({ err, staffId, tenantId, month, year }, 'Salary slip generation failed');
          await SalarySlip.findOneAndUpdate(
            { tenantId, staffId, month, year },
            { $set: { status: 'failed', error: err.message } },
            { upsert: true }
          );
          failed.push({ staffId, error: err.message });
        }
      }

      return { succeeded, failed };
    },
    { connection: redis, concurrency: 2 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Salary slip job failed');
  });

  logger.info('Salary slip worker started');
  return worker;
}
