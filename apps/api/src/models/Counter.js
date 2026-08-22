import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const counterSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  key: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.plugin(tenantScopePlugin);
counterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const Counter = mongoose.model('Counter', counterSchema);
