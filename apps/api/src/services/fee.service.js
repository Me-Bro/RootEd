import PDFDocument from 'pdfkit';
import { Student } from '../models/Student.js';
import { Section } from '../models/Section.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { FeeStructure } from '../models/FeeStructure.js';
import { FeeDiscount } from '../models/FeeDiscount.js';
import { uploadBuffer } from './storage.service.js';
import { getNextSequence } from './counter.service.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  calculateMandatoryTotal,
  calculateEffectiveTotal,
  calculateDiscountAmount,
  calculateRemainingDue,
  recomputeFeeStatus,
  discountAppliesTo,
} from '../utils/feeCalculations.js';
import { autoAssignSupported } from '../utils/feeAutoAssignScope.js';
import { scheduleLateCharge } from '../workers/feeLateCharge.worker.js';

const MAX_MUTATION_ATTEMPTS = 3;

// Fetch -> mutate -> recompute -> save, with retry on optimistic-concurrency
// conflicts (FeeAssignment has `optimisticConcurrency: true`). Shared by
// recordPayment, refundPayment, and applyDiscountToAssignment so all three
// derive `installments`/`status` from the same recomputeFeeStatus logic.
export async function applyAssignmentMutation(assignmentId, tenantId, extraMutate) {
  for (let attempt = 1; attempt <= MAX_MUTATION_ATTEMPTS; attempt++) {
    const assignment = await FeeAssignment.findOne({ _id: assignmentId, tenantId });
    if (!assignment) throw new AppError('FeeAssignment not found', 404);

    if (extraMutate) extraMutate(assignment);

    const payments = await FeePayment.find({
      tenantId,
      assignmentId,
      refunded: { $ne: true },
    }).lean();
    const { installments, status } = recomputeFeeStatus({ assignment, payments });
    if (installments) assignment.installments = installments;
    if (assignment.status !== 'waived') assignment.status = status;

    try {
      await assignment.save();
      return assignment;
    } catch (err) {
      if (err.name === 'VersionError' && attempt < MAX_MUTATION_ATTEMPTS) continue;
      throw err;
    }
  }
}

export async function assignFeesToStudents({
  studentIds,
  feeStructureId,
  tenantId,
  dueDateOverride,
}) {
  const structure = await FeeStructure.findOne({ _id: feeStructureId, tenantId }).lean();
  if (!structure) throw new Error('FeeStructure not found');

  const totalAmount = calculateMandatoryTotal(structure.components);
  const hasInstallments = Boolean(structure.installments?.length);
  const installmentsSnapshot = hasInstallments
    ? structure.installments.map((i) => ({
        label: i.label,
        amount: i.amount,
        dueDate: i.dueDate,
        status: 'unpaid',
        paidAmount: 0,
      }))
    : undefined;
  const dueDate =
    dueDateOverride ||
    (hasInstallments
      ? new Date(Math.max(...structure.installments.map((i) => new Date(i.dueDate).getTime())))
      : structure.dueDate);

  let created = 0;
  let skipped = 0;

  for (const studentId of studentIds) {
    const exists = await FeeAssignment.findOne({
      tenantId,
      studentId,
      feeStructureId: structure._id,
      academicYearId: structure.academicYearId,
    }).lean();

    if (exists) {
      skipped++;
      continue;
    }

    const assignment = await FeeAssignment.create({
      tenantId,
      studentId,
      feeStructureId: structure._id,
      academicYearId: structure.academicYearId,
      totalAmount,
      dueDate,
      ...(installmentsSnapshot ? { installments: installmentsSnapshot } : {}),
    });

    created++;

    if (structure.lateFeeEnabled && dueDate) {
      const delayMs =
        new Date(dueDate).getTime() + (structure.lateFeeGraceDays || 0) * 86400000 - Date.now();
      await scheduleLateCharge(assignment._id, delayMs);
    }
  }

  return { created, skipped };
}

export async function assignFeesToSection(sectionId, feeStructureId, tenantId, dueDateOverride) {
  const students = await Student.find({ tenantId, sectionId, status: 'active' }, '_id').lean();
  return assignFeesToStudents({
    studentIds: students.map((s) => s._id),
    feeStructureId,
    tenantId,
    dueDateOverride,
  });
}

export async function resolveStudentIdsForStructure(structure, tenantId) {
  if (!autoAssignSupported(structure.applicableTo, structure.classId)) return [];

  if (structure.applicableTo === 'all') {
    const students = await Student.find({ tenantId, status: 'active' }, '_id').lean();
    return students.map((s) => s._id);
  }

  const sections = await Section.find({ tenantId, classId: structure.classId }, '_id').lean();
  const students = await Student.find(
    { tenantId, sectionId: { $in: sections.map((s) => s._id) }, status: 'active' },
    '_id'
  ).lean();
  return students.map((s) => s._id);
}

export async function recordPayment({
  assignmentId,
  amount,
  paymentMethod,
  transactionId,
  collectedBy,
  notes,
  tenantId,
  installmentIndex,
}) {
  const assignment = await FeeAssignment.findOne({ _id: assignmentId, tenantId }).lean();
  if (!assignment) throw new AppError('FeeAssignment not found', 404);
  if (assignment.status === 'waived') {
    throw new AppError('Cannot record a payment against a waived assignment', 400);
  }

  const existingPayments = await FeePayment.find({
    tenantId,
    assignmentId,
    refunded: { $ne: true },
  }).lean();
  const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = calculateRemainingDue({ assignment, totalPaid, installmentIndex });
  if (amount > remaining) throw new AppError('Payment exceeds amount due', 400);

  const year = new Date().getFullYear();
  const seq = await getNextSequence(tenantId, `feePayment:receipt:${year}`);
  const receiptNumber = `RCP-${year}-${String(seq).padStart(5, '0')}`;

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
    installmentIndex,
  });

  try {
    // NOTE: this still reads totalPaid (above) before this payment was
    // created, so two truly concurrent recordPayment calls on the same
    // assignment can each pass the overpayment check against the same
    // stale totalPaid. optimisticConcurrency + this retry loop fixes the
    // lost-update on installments/status, not this check-then-act race —
    // closing that fully needs a transaction, out of scope here.
    await applyAssignmentMutation(assignmentId, tenantId);
  } catch (err) {
    // Don't leave an orphaned payment behind if the assignment side
    // permanently fails after retrying — a client retry on 409 must be
    // safe, i.e. must not find a payment that was silently double-recorded.
    await FeePayment.deleteOne({ _id: payment._id, tenantId });
    if (err.name === 'VersionError') {
      throw new AppError('Concurrent payment conflict — please retry', 409);
    }
    throw err;
  }

  const student = await Student.findOne({ _id: assignment.studentId, tenantId }).lean();
  const receiptPdfKey = await generateReceiptPdf({
    payment,
    student,
    receiptNumber,
    amount,
    paymentMethod,
    tenantId,
  });

  await FeePayment.findOneAndUpdate({ _id: payment._id, tenantId }, { $set: { receiptPdfKey } });
  payment.receiptPdfKey = receiptPdfKey;

  return payment;
}

async function generateReceiptPdf({
  payment,
  student,
  receiptNumber,
  amount,
  paymentMethod,
  tenantId,
}) {
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
    doc.fontSize(12).text(`School: RootEd School`, { align: 'center' });
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
  if (!assignment) throw new AppError('FeeAssignment not found', 404);

  const payments = await FeePayment.find({
    tenantId,
    assignmentId,
    refunded: { $ne: true },
  }).lean();
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = calculateEffectiveTotal(assignment) - totalPaid;

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return {
      orderId: 'mock_order',
      amount: Math.round(outstanding * 100),
      currency: 'INR',
      mock: true,
    };
  }

  const Razorpay = (await import('razorpay')).default;
  const razorpay = new Razorpay({
    key_id: env.RAZORPAY_KEY_ID,
    key_secret: env.RAZORPAY_KEY_SECRET,
  });

  const order = await razorpay.orders.create({
    amount: Math.round(outstanding * 100),
    currency: 'INR',
    receipt: assignmentId.toString(),
  });

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    key: env.RAZORPAY_KEY_ID,
  };
}

export async function applyDiscountToAssignment({ assignmentId, discountId, tenantId }) {
  const discount = await FeeDiscount.findOne({ _id: discountId, tenantId }).lean();
  if (!discount) throw new AppError('FeeDiscount not found', 404);

  const assignment = await FeeAssignment.findOne({ _id: assignmentId, tenantId }).lean();
  if (!assignment) throw new AppError('FeeAssignment not found', 404);
  if (assignment.status === 'paid' || assignment.status === 'waived') {
    throw new AppError(`Cannot apply a discount to a ${assignment.status} assignment`, 400);
  }

  let studentClassId;
  if (discount.applicableTo === 'class') {
    const student = await Student.findOne({ _id: assignment.studentId, tenantId }).lean();
    const section = student?.sectionId
      ? await Section.findOne({ _id: student.sectionId, tenantId }).lean()
      : null;
    studentClassId = section?.classId;
  }

  if (!discountAppliesTo({ discount, assignment, studentClassId })) {
    throw new AppError('Discount is not applicable to this assignment', 400);
  }

  const discountAmount = calculateDiscountAmount({
    type: discount.type,
    value: discount.value,
    baseAmount: assignment.totalAmount,
  });

  return applyAssignmentMutation(assignmentId, tenantId, (doc) => {
    doc.discountAmount = discountAmount;
    doc.discountReason = discount.name;
  });
}

export async function refundPayment({ paymentId, tenantId, reason, actorId }) {
  const payment = await FeePayment.findOne({ _id: paymentId, tenantId });
  if (!payment) throw new AppError('FeePayment not found', 404);
  if (payment.refunded) throw new AppError('Payment has already been refunded', 400);

  payment.refunded = true;
  payment.refundedAt = new Date();
  payment.refundedBy = actorId;
  payment.refundReason = reason;
  await payment.save();

  // NOTE: internal ledger reversal only — does not call Razorpay's refund
  // API. If the original payment was collected online, moving money back
  // to the payer is a manual/out-of-band process.
  await applyAssignmentMutation(payment.assignmentId, tenantId);

  return payment;
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
    overdueInstallments: (a.installments || []).filter(
      (i) => i.status !== 'paid' && new Date(i.dueDate) < today
    ).length,
  }));
}
