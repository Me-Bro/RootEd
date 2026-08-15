import PDFDocument from 'pdfkit';
import { Student } from '../models/Student.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { FeeStructure } from '../models/FeeStructure.js';
import { uploadBuffer } from './storage.service.js';
import { env } from '../config/env.js';

export async function assignFeesToSection(sectionId, feeStructureId, tenantId) {
  const structure = await FeeStructure.findOne({ _id: feeStructureId, tenantId }).lean();
  if (!structure) throw new Error('FeeStructure not found');

  const students = await Student.find({ tenantId, sectionId, status: 'active' }).lean();

  const totalAmount = structure.components.reduce((sum, c) => sum + c.amount, 0);

  let created = 0;
  let skipped = 0;

  for (const student of students) {
    const exists = await FeeAssignment.findOne({
      tenantId,
      studentId: student._id,
      feeStructureId: structure._id,
      academicYearId: structure.academicYearId,
    }).lean();

    if (exists) {
      skipped++;
      continue;
    }

    await FeeAssignment.create({
      tenantId,
      studentId: student._id,
      feeStructureId: structure._id,
      academicYearId: structure.academicYearId,
      totalAmount,
      dueDate: structure.dueDate,
    });

    created++;
  }

  return { created, skipped };
}

export async function recordPayment({ assignmentId, amount, paymentMethod, transactionId, collectedBy, notes, tenantId }) {
  const assignment = await FeeAssignment.findOne({ _id: assignmentId, tenantId });
  if (!assignment) throw new Error('FeeAssignment not found');

  const count = await FeePayment.countDocuments({ tenantId });
  const year = new Date().getFullYear();
  const receiptNumber = `RCP-${year}-${String(count + 1).padStart(5, '0')}`;

  const payment = await FeePayment.create({
    tenantId,
    assignmentId,
    studentId: assignment.studentId,
    amount,
    paymentMethod,
    transactionId,
    receiptNumber,
    collectedBy,
    notes,
  });

  const allPayments = await FeePayment.find({ tenantId, assignmentId }).lean();
  const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
  const effectiveTotal = assignment.totalAmount - (assignment.discountAmount || 0);

  let status = 'partial';
  if (totalPaid >= effectiveTotal) status = 'paid';

  assignment.status = status;
  await assignment.save();

  const student = await Student.findOne({ _id: assignment.studentId, tenantId }).lean();
  const receiptPdfKey = await generateReceiptPdf({ payment, student, receiptNumber, amount, paymentMethod, tenantId });

  await FeePayment.findOneAndUpdate({ _id: payment._id, tenantId }, { $set: { receiptPdfKey } });
  payment.receiptPdfKey = receiptPdfKey;

  return payment;
}

async function generateReceiptPdf({ payment, student, receiptNumber, amount, paymentMethod, tenantId }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', async () => {
      const buffer = Buffer.concat(chunks);
      const key = `fees/${tenantId}/receipts/${receiptNumber}.pdf`;
      try {
        await uploadBuffer(key, buffer, 'application/pdf');
        resolve(key);
      } catch (err) {
        reject(err);
      }
    });
    doc.on('error', reject);

    doc.fontSize(20).text('Fee Receipt', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`School: EduFlow School`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11);
    doc.text(`Receipt No: ${receiptNumber}`);
    doc.text(`Date: ${new Date(payment.paymentDate || Date.now()).toLocaleDateString()}`);
    doc.moveDown();

    if (student) {
      doc.text(`Student Name: ${student.firstName} ${student.lastName}`);
      doc.text(`Admission No: ${student.admissionNo}`);
      doc.moveDown();
    }

    doc.text(`Amount Paid: ${amount}`);
    doc.text(`Payment Method: ${paymentMethod}`);
    if (payment.transactionId) doc.text(`Transaction ID: ${payment.transactionId}`);

    doc.end();
  });
}

export async function initiateOnlinePayment(assignmentId, tenantId) {
  const assignment = await FeeAssignment.findOne({ _id: assignmentId, tenantId }).lean();
  if (!assignment) throw new Error('FeeAssignment not found');

  const student = await Student.findOne({ _id: assignment.studentId, tenantId }).lean();

  const payments = await FeePayment.find({ tenantId, assignmentId }).lean();
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = (assignment.totalAmount - (assignment.discountAmount || 0)) - totalPaid;

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return { orderId: 'mock_order', amount: Math.round(outstanding * 100), currency: 'INR', mock: true };
  }

  const Razorpay = (await import('razorpay')).default;
  const razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });

  const order = await razorpay.orders.create({
    amount: Math.round(outstanding * 100),
    currency: 'INR',
    receipt: assignmentId.toString(),
  });

  return { orderId: order.id, amount: order.amount, currency: order.currency, key: env.RAZORPAY_KEY_ID };
}

export async function getDefaulters(tenantId, academicYearId) {
  const today = new Date();
  const filter = {
    tenantId,
    status: { $in: ['unpaid', 'partial'] },
    dueDate: { $lt: today },
  };
  if (academicYearId) filter.academicYearId = academicYearId;

  const assignments = await FeeAssignment.find(filter)
    .populate('studentId', 'firstName lastName admissionNo sectionId')
    .populate('feeStructureId', 'name')
    .lean();

  return assignments.map((a) => ({
    ...a,
    daysOverdue: Math.floor((today - new Date(a.dueDate)) / (1000 * 60 * 60 * 24)),
  }));
}
