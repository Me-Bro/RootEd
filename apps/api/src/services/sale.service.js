import { FeeStructure } from '../models/FeeStructure.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeeDiscount } from '../models/FeeDiscount.js';
import { FeePayment } from '../models/FeePayment.js';
import { logger } from '../utils/logger.js';
import { Student } from '../models/Student.js';
import { Section } from '../models/Section.js';
import { AppError } from '../middleware/errorHandler.js';
import { recordPayment } from './fee.service.js';
import { coverageFor } from '../utils/planCoverage.js';
import { pickStandingDiscount } from '../utils/discountPolicy.js';
import {
  calculateMandatoryTotal,
  calculateDiscountAmount,
  discountAppliesTo,
} from '../utils/feeCalculations.js';

/**
 * Sells one plan or day pass and takes the payment, in one request.
 *
 * Every sale is its own FeeAssignment for one period: it deliberately skips the
 * "one assignment per structure per year" check that roster assignment uses, since a
 * renewal and a second day pass are new sales. The discount is decided before
 * anything is written: the learner's own standing discount applies automatically
 * (the owner set it up in advance), and an ad hoc catalog discount applies only when
 * the caller is allowed to. If the payment then fails the new assignment is removed,
 * so no discount or assignment is left behind.
 */
export async function sellPlan({
  tenant,
  studentId,
  feeStructureId,
  paymentMethod,
  transactionId,
  discountId,
  startDate,
  collectedBy,
  allowAdHocDiscount,
  now = new Date(),
}) {
  const tenantId = tenant._id;

  const structure = await FeeStructure.findOne({ _id: feeStructureId, tenantId }).lean();
  if (!structure) throw new AppError('Plan not found', 404);
  if (!structure.plan?.kind) throw new AppError('This fee is not a plan or a day pass', 422);
  if (structure.isActive === false) throw new AppError('This plan is not on sale', 422);

  const student = await Student.findOne({ _id: studentId, tenantId }).lean();
  if (!student) throw new AppError('Learner not found', 404);
  if (student.status !== 'active') throw new AppError('This learner is not active', 422);

  const { coversFrom, coversTo } = coverageFor({
    plan: structure.plan,
    startDate: startDate ?? now,
    timezone: tenant.timezone,
  });
  const totalAmount = calculateMandatoryTotal(structure.components);

  const discount = await chooseDiscount({
    tenantId,
    student,
    discountId,
    allowAdHocDiscount,
    totalAmount,
    now,
  });
  const discountAmount = discount
    ? calculateDiscountAmount({
        type: discount.type,
        value: discount.value,
        baseAmount: totalAmount,
      })
    : 0;
  const effectiveTotal = totalAmount - discountAmount;

  const assignment = await FeeAssignment.create({
    tenantId,
    studentId,
    feeStructureId: structure._id,
    academicYearId: structure.academicYearId,
    totalAmount,
    discountAmount,
    ...(discount ? { discountReason: discount.name } : {}),
    dueDate: coversFrom,
    coversFrom,
    coversTo,
    // Nothing to pay: a 100% discount is stored as waived so it still counts as a
    // valid plan, and no zero-amount payment is recorded.
    ...(effectiveTotal <= 0
      ? {
          status: 'waived',
          waivedAt: now,
          waivedBy: collectedBy,
          waivedReason: 'full discount',
        }
      : {}),
  });

  if (effectiveTotal <= 0) return { assignment, payment: null, discount, discountAmount };

  try {
    const payment = await recordPayment({
      assignmentId: assignment._id,
      amount: effectiveTotal,
      paymentMethod,
      transactionId,
      collectedBy,
      tenantId,
      receiptContext: {
        planName: structure.name,
        coversFrom,
        coversTo,
        tenantName: tenant.name,
        timezone: tenant.timezone,
      },
    });
    const fresh = await FeeAssignment.findOne({ _id: assignment._id, tenantId }).lean();
    return { assignment: fresh, payment, discount, discountAmount };
  } catch (err) {
    // If the money was already taken and only the receipt failed (the PDF could not
    // be stored), the sale stands: undoing it would leave a payment with no
    // assignment. The desk gets no receipt link and can print one later.
    const taken = await FeePayment.findOne({ tenantId, assignmentId: assignment._id }).lean();
    if (taken) {
      logger.warn({ err, assignmentId: assignment._id }, 'sale recorded but receipt failed');
      const fresh = await FeeAssignment.findOne({ _id: assignment._id, tenantId }).lean();
      return { assignment: fresh, payment: taken, discount, discountAmount };
    }
    // Otherwise the assignment is this sale's own and has no payment, so nothing
    // else refers to it.
    await FeeAssignment.deleteOne({ _id: assignment._id, tenantId });
    throw err;
  }
}

async function chooseDiscount({
  tenantId,
  student,
  discountId,
  allowAdHocDiscount,
  totalAmount,
  now,
}) {
  if (discountId) {
    if (!allowAdHocDiscount) {
      throw new AppError('You are not allowed to apply a discount', 403);
    }
    const chosen = await FeeDiscount.findOne({ _id: discountId, tenantId }).lean();
    if (!chosen) throw new AppError('Discount not found', 404);

    let studentClassId;
    if (chosen.applicableTo === 'class' && student.sectionId) {
      const section = await Section.findOne({ _id: student.sectionId, tenantId }, 'classId').lean();
      studentClassId = section?.classId;
    }
    if (
      !discountAppliesTo({
        discount: chosen,
        assignment: { studentId: student._id },
        studentClassId,
        at: now,
      })
    ) {
      throw new AppError('That discount does not apply to this learner today', 422);
    }
    return chosen;
  }

  const standing = await FeeDiscount.find({
    tenantId,
    applicableTo: 'student',
    studentId: student._id,
  }).lean();
  return pickStandingDiscount({
    discounts: standing,
    studentId: student._id,
    at: now,
    baseAmount: totalAmount,
  });
}
