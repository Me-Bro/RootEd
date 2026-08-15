import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const resolvedComponentSchema = new mongoose.Schema({
  label: { type: String },
  type: { type: String, enum: ['earning', 'deduction'] },
  amount: { type: Number },
}, { _id: false });

const salarySlipSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffMember', required: true },
    month: { type: Number, min: 1, max: 12, required: true },
    year: { type: Number, required: true },
    components: [resolvedComponentSchema],
    grossEarnings: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    netPay: { type: Number, default: 0 },
    status: { type: String, enum: ['draft', 'generated', 'paid'], default: 'draft' },
    pdfKey: { type: String },
  },
  { timestamps: true }
);

salarySlipSchema.plugin(tenantScopePlugin);
salarySlipSchema.index({ tenantId: 1, staffId: 1, month: 1, year: 1 }, { unique: true });

export const SalarySlip = mongoose.model('SalarySlip', salarySlipSchema);
