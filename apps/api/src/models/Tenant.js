import mongoose from 'mongoose';
import { ORG_TYPES, JOIN_POLICY_MODES, PLANS, DEFAULT_PLAN } from '@rooted/shared/constants';

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    subdomain: { type: String, lowercase: true, trim: true },
    plan: {
      type: String,
      enum: PLANS,
      default: DEFAULT_PLAN,
    },
    orgType: {
      type: String,
      enum: ORG_TYPES,
      default: 'school',
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'archived'],
      default: 'active',
    },
    locale: { type: String, default: 'en' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Unlike every other secret in this codebase the join code is stored in
    // clear: it is meant to be displayed to an admin and read off a whiteboard,
    // so it has to be retrievable. It is a low-value credential — it buys a
    // *pending* request, never access — and is rate limited and rotatable.
    joinPolicy: {
      mode: { type: String, enum: JOIN_POLICY_MODES, default: 'closed' },
      code: { type: String, uppercase: true, trim: true },
      codeExpiresAt: { type: Date },
      defaultRoleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
      requireApproval: { type: Boolean, default: true },
    },
    archivedAt: { type: Date },
    dataRetentionUntil: { type: Date },
    trialEndsAt: { type: Date },
    isTrialActive: { type: Boolean, default: false },
    discountType: {
      type: String,
      enum: ['none', 'nonprofit', 'government', 'annual_prepay'],
      default: 'none',
    },
    discountPct: { type: Number, default: 0 },
  },
  { timestamps: true }
);

tenantSchema.index({ subdomain: 1 }, { unique: true, sparse: true });
tenantSchema.index({ status: 1 });
tenantSchema.index({ 'joinPolicy.code': 1 }, { unique: true, sparse: true });

export const Tenant = mongoose.model('Tenant', tenantSchema);
