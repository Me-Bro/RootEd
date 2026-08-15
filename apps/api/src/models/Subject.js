import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const subjectSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    creditHours: { type: Number },
  },
  { timestamps: true }
);

subjectSchema.plugin(tenantScopePlugin);
subjectSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export const Subject = mongoose.model('Subject', subjectSchema);
