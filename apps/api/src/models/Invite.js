import mongoose from 'mongoose';
import { INVITE_STATUS } from '@rooted/shared/constants';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// Only the SHA-256 digest of the invite token is stored — the raw value exists
// solely in the email, the same discipline as password reset and email
// verification. Acceptance looks the invite up by digest, and does so with
// _bypassTenantScope because the caller is on the portal host and the whole
// point of the token is that it identifies the tenant.
const inviteSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    status: { type: String, enum: INVITE_STATUS, default: 'pending' },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    acceptedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acceptedAt: { type: Date },
  },
  { timestamps: true }
);

inviteSchema.plugin(tenantScopePlugin);
inviteSchema.index({ tokenHash: 1 }, { unique: true });
inviteSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
// At most one live invite per address per tenant: re-inviting rotates the
// existing one rather than leaving several tokens valid at once.
inviteSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

export const Invite = mongoose.model('Invite', inviteSchema);
