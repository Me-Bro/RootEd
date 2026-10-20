import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// A company a college's students apply to. Per tenant, because every model is
// tenant-scoped; two colleges working with the same company each hold a row.
const employerSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true },
    contactName: { type: String },
    contactEmail: { type: String },
    contactPhone: { type: String },
    notes: { type: String },
    // Retired, not deleted: past applications still point at it.
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

employerSchema.plugin(tenantScopePlugin);
employerSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Employer = mongoose.model('Employer', employerSchema);
