import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const purchaseRequisitionSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    requestedQuantity: { type: Number, required: true },
    reason: { type: String },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'ordered'],
      default: 'pending',
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    linkedExpenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseEntry' },
  },
  { timestamps: true }
);

purchaseRequisitionSchema.plugin(tenantScopePlugin);
purchaseRequisitionSchema.index({ tenantId: 1, status: 1 });

export const PurchaseRequisition = mongoose.model('PurchaseRequisition', purchaseRequisitionSchema);
