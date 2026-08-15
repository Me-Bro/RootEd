import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const termSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { timestamps: true }
);

termSchema.plugin(tenantScopePlugin);
termSchema.index({ tenantId: 1, academicYearId: 1 });

export const Term = mongoose.model('Term', termSchema);
