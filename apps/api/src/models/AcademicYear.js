import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const academicYearSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

academicYearSchema.plugin(tenantScopePlugin);
academicYearSchema.index({ tenantId: 1, isActive: 1 });

export const AcademicYear = mongoose.model('AcademicYear', academicYearSchema);
