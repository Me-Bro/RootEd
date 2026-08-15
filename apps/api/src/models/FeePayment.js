import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const feePaymentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeAssignment', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    amount: { type: Number, required: true },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'bank_transfer', 'cheque'],
      required: true,
    },
    transactionId: { type: String },
    receiptNumber: { type: String, required: true },
    paymentDate: { type: Date, default: Date.now },
    collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String },
    receiptPdfKey: { type: String },
  },
  { timestamps: true }
);

feePaymentSchema.plugin(tenantScopePlugin);
feePaymentSchema.index({ tenantId: 1, studentId: 1, paymentDate: -1 });
feePaymentSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true });

export const FeePayment = mongoose.model('FeePayment', feePaymentSchema);
