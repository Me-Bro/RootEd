import mongoose from 'mongoose';
import { ORG_TYPES } from '@rooted/shared/constants';

const tenantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    subdomain: { type: String, lowercase: true, trim: true },
    plan: {
      type: String,
      enum: ['starter', 'growth', 'pro', 'enterprise'],
      default: 'starter',
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

export const Tenant = mongoose.model('Tenant', tenantSchema);
