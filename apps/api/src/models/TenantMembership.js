import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const membershipSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
    status: {
      type: String,
      enum: ['active', 'suspended', 'invited'],
      default: 'invited',
    },
  },
  { timestamps: true }
);

membershipSchema.plugin(tenantScopePlugin);
membershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ tenantId: 1, status: 1 });

export const TenantMembership = mongoose.model('TenantMembership', membershipSchema);
