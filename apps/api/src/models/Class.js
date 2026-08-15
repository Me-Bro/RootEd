import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const classSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    gradeLevel: { type: Number },
  },
  { timestamps: true }
);

classSchema.plugin(tenantScopePlugin);
classSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Class = mongoose.model('Class', classSchema);
