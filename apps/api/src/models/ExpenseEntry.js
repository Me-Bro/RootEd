import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const approvalStepSchema = new mongoose.Schema({
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  actedAt: { type: Date },
  comment: { type: String },
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  name: { type: String },
  key: { type: String },
}, { _id: false });

const expenseEntrySchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    paymentMethod: { type: String, enum: ['cash', 'card', 'bank_transfer', 'upi'] },
    vendor: { type: String },
    invoiceDate: { type: Date },
    costCenterId: { type: mongoose.Schema.Types.ObjectId, ref: 'CostCenter' },
    attachments: [attachmentSchema],
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected', 'paid'],
      default: 'draft',
    },
    approvalChain: [approvalStepSchema],
    currentApproverIndex: { type: Number, default: 0 },
    isReimbursement: { type: Boolean, default: false },
    paidAt: { type: Date },
  },
  { timestamps: true }
);

expenseEntrySchema.plugin(tenantScopePlugin);
expenseEntrySchema.index({ tenantId: 1, status: 1, invoiceDate: -1 });
expenseEntrySchema.index({ tenantId: 1, costCenterId: 1, invoiceDate: -1 });
expenseEntrySchema.index({ tenantId: 1, submittedBy: 1, status: 1 });

export const ExpenseEntry = mongoose.model('ExpenseEntry', expenseEntrySchema);
