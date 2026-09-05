import mongoose from 'mongoose';
import { MEMBERSHIP_STATUS, JOIN_METHODS } from '@rooted/shared/constants';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const membershipSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
    status: {
      type: String,
      enum: MEMBERSHIP_STATUS,
      default: 'invited',
    },
    // How this seat came to exist. Kept for audit and because the join paths
    // have different trust levels — an imported roster row is not the same
    // thing as somebody who typed a join code.
    joinMethod: { type: String, enum: JOIN_METHODS, default: 'import' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    requestNote: { type: String, trim: true, maxlength: 500 },
    // Optional per-org display override; the canonical name lives on User.
    displayName: { type: String, trim: true },
  },
  { timestamps: true }
);

membershipSchema.plugin(tenantScopePlugin);
membershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ tenantId: 1, status: 1 });

export const TenantMembership = mongoose.model('TenantMembership', membershipSchema);
