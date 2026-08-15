import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const costCenterSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    budget: { type: Number, default: 0 },
  },
  { timestamps: true }
);

costCenterSchema.plugin(tenantScopePlugin);
costCenterSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export const CostCenter = mongoose.model('CostCenter', costCenterSchema);
