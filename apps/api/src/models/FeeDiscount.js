import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const feeDiscountSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['percentage', 'flat'], required: true },
    value: { type: Number, required: true },
    applicableTo: { type: String, enum: ['all', 'class', 'student'], required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);

feeDiscountSchema.plugin(tenantScopePlugin);

export const FeeDiscount = mongoose.model('FeeDiscount', feeDiscountSchema);
