import mongoose from 'mongoose';
import { BILLING_CYCLES } from '@rooted/shared/schemas';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const { ObjectId } = mongoose.Schema.Types;

// Study-center cycle billing: the learner's timeline, from which what they owe is
// computed on read (utils/billingCycle.js). Days are centre-calendar days stored as
// UTC-midnight Dates; ranges are half-open (`to`, a pause's `to` and `endedOn` are the
// first day not billed). Each segment snapshots the structure's price, so editing a
// structure never rewrites a past cycle.
const billingSchema = new mongoose.Schema(
  {
    segments: [
      {
        _id: false,
        feeStructureId: { type: ObjectId, ref: 'FeeStructure', required: true },
        cycle: { type: String, enum: BILLING_CYCLES, required: true },
        amount: { type: Number, required: true, min: 0 },
        from: { type: Date, required: true },
        to: { type: Date },
      },
    ],
    pauses: [{ _id: false, from: { type: Date, required: true }, to: { type: Date } }],
    endedOn: { type: Date },
  },
  { _id: false }
);

const feeAssignmentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    totalAmount: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    discountReason: { type: String },
    lateFeeAmount: { type: Number, default: 0 },
    dueDate: { type: Date },
    installments: [
      {
        label: { type: String, required: true },
        amount: { type: Number, required: true },
        dueDate: { type: Date, required: true },
        status: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
        paidAmount: { type: Number, default: 0 },
      },
    ],
    status: { type: String, enum: ['unpaid', 'partial', 'paid', 'waived'], default: 'unpaid' },
    waivedAt: { type: Date },
    waivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    waivedReason: { type: String },
    // The period this assignment lets the learner use the centre (a sale sets both).
    coversFrom: { type: Date },
    coversTo: { type: Date },
    // Study centers: the learner's monthly/weekly plan. When present, totalAmount is
    // the current price per cycle (informational), dueDate is unset and status is not
    // kept up to date: every reader works the balance out from the ledger instead.
    billing: { type: billingSchema, default: undefined },
  },
  { timestamps: true, optimisticConcurrency: true }
);

feeAssignmentSchema.plugin(tenantScopePlugin);
feeAssignmentSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1 });
feeAssignmentSchema.index({ tenantId: 1, status: 1, dueDate: 1 });
// One cycle plan per learner; the database settles two simultaneous first assignments.
feeAssignmentSchema.index(
  { tenantId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { billing: { $exists: true } } }
);

export const FeeAssignment = mongoose.model('FeeAssignment', feeAssignmentSchema);
