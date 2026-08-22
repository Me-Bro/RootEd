import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const componentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // stable identity for baseRef matching, independent of label
    label: { type: String, required: true },
    type: { type: String, enum: ['earning', 'deduction'], required: true },
    amount: { type: String, required: true }, // AES-256-GCM ciphertext, see services/salary.service.js
    isPercentage: { type: Boolean, default: false },
    baseRef: { type: String }, // references a sibling component's `id`, not its label
  },
  { _id: false }
);

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
