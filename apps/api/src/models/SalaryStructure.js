import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const componentSchema = new mongoose.Schema({
  label: { type: String, required: true },
  type: { type: String, enum: ['earning', 'deduction'], required: true },
  amount: { type: Number, required: true },
  isPercentage: { type: Boolean, default: false },
  baseRef: { type: String },
}, { _id: false });

const salaryStructureSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    components: [componentSchema],
  },
  { timestamps: true }
);

salaryStructureSchema.plugin(tenantScopePlugin);

export const SalaryStructure = mongoose.model('SalaryStructure', salaryStructureSchema);
