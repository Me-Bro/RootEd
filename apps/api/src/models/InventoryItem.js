import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const baseSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    unitCost: { type: Number, default: 0 },
    location: { type: String },
    custodianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    itemType: { type: String, enum: ['consumable', 'fixed_asset'], required: true },
  },
  { timestamps: true, discriminatorKey: 'itemType' }
);

baseSchema.plugin(tenantScopePlugin);
baseSchema.index({ tenantId: 1, sku: 1 }, { unique: true });
baseSchema.index({ tenantId: 1, category: 1 });

export const InventoryItem = mongoose.model('InventoryItem', baseSchema);

export const Consumable = InventoryItem.discriminator(
  'consumable',
  new mongoose.Schema({
    quantity: { type: Number, default: 0 },
    reorderLevel: { type: Number, default: 0 },
  })
);

export const FixedAsset = InventoryItem.discriminator(
  'fixed_asset',
  new mongoose.Schema({
    assetId: { type: String },
    purchaseDate: { type: Date },
    depreciationMethod: { type: String, enum: ['slm', 'wdv'], default: 'slm' },
    usefulLifeYears: { type: Number, default: 5 },
    currentValue: { type: Number },
    condition: { type: String, enum: ['good', 'fair', 'poor', 'scrapped'], default: 'good' },
  })
);
