import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const budgetSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    costCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter', required: true },
    category: { type: String },
    period: { type: String, enum: ['monthly', 'annual'], required: true },
    year: { type: Number, required: true },
    month: { type: Number },
    cap: { type: Number, required: true },
    spent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

budgetSchema.plugin(tenantScopePlugin);
budgetSchema.index({ tenantId: 1, costCenterId: 1, year: 1, month: 1 });

export const Budget = mongoose.model('Budget', budgetSchema);
