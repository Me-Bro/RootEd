import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const sectionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    classId: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    name: { type: String, required: true },
    classTeacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

sectionSchema.plugin(tenantScopePlugin);
sectionSchema.index({ tenantId: 1, classId: 1, name: 1 }, { unique: true });

export const Section = mongoose.model('Section', sectionSchema);
