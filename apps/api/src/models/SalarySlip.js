import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const resolvedComponentSchema = new mongoose.Schema(
  {
    label: { type: String },
    type: { type: String, enum: ['earning', 'deduction'] },
    amount: { type: String }, // AES-256-GCM ciphertext, see services/salary.service.js
  },
  { _id: false }
);

const salarySlipSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffMember', required: true },
    month: { type: Number, min: 1, max: 12, required: true },
    year: { type: Number, required: true },
    components: [resolvedComponentSchema],
    grossEarnings: { type: String, default: null }, // ciphertext
    totalDeductions: { type: String, default: null }, // ciphertext
    netPay: { type: String, default: null }, // ciphertext
    status: {
      type: String,
      enum: ['draft', 'queued', 'generated', 'failed', 'paid'],
      default: 'draft',
    },
    pdfKey: { type: String },
    jobId: { type: String },
    error: { type: String },
    paidOn: { type: Date },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

salarySlipSchema.plugin(tenantScopePlugin);
salarySlipSchema.index({ tenantId: 1, staffId: 1, month: 1, year: 1 }, { unique: true });

export const SalarySlip = mongoose.model('SalarySlip', salarySlipSchema);
