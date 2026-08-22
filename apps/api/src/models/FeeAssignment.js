import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const feeAssignmentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    feeStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    totalAmount: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    discountReason: { type: String },
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
  },
  { timestamps: true }
);

feeAssignmentSchema.plugin(tenantScopePlugin);
feeAssignmentSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1 });
feeAssignmentSchema.index({ tenantId: 1, status: 1, dueDate: 1 });

export const FeeAssignment = mongoose.model('FeeAssignment', feeAssignmentSchema);
