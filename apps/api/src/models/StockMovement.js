import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const stockMovementSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    movementType: {
      type: String,
      enum: ['purchase', 'issue', 'return', 'scrap', 'transfer', 'adjustment'],
      required: true,
    },
    quantity: { type: Number, required: true },
    unitCost: { type: Number },
    fromLocation: { type: String },
    toLocation: { type: String },
    issuedTo: {
      entityType: { type: String, enum: ['staff', 'student'] },
      entityId: { type: mongoose.Schema.Types.ObjectId },
    },
    dueDate: { type: Date },
    returnedAt: { type: Date },
    reason: { type: String },
    movedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    referenceId: { type: String },
  },
  { timestamps: true }
);

stockMovementSchema.plugin(tenantScopePlugin);
stockMovementSchema.index({ tenantId: 1, itemId: 1, createdAt: -1 });
stockMovementSchema.index({ tenantId: 1, movementType: 1, createdAt: -1 });

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
