import mongoose from 'mongoose';
import { monitoringConnection } from '../config/monitoringDb.js';

// One row per send attempt (a retried bulk job logs each attempt). Lives on the
// monitoring connection like RequestLog: platform-level, not tenantScopePlugin'd,
// and read only by super_admin to size up the mail provider's free tier.
const emailLogSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['smtp', 'postmark', 'console'], required: true },
    kind: { type: String },
    to: { type: String, required: true },
    subject: { type: String },
    status: { type: String, enum: ['sent', 'failed', 'skipped'], required: true },
    reason: {
      type: String,
      enum: [
        'rate_limit',
        'auth',
        'connection',
        'recipient_rejected',
        'not_configured',
        'console_provider',
        'other',
      ],
    },
    errorCode: { type: String },
    errorMessage: { type: String },
    durationMs: { type: Number },
    messageId: { type: String },
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
);

emailLogSchema.index({ at: -1 });
emailLogSchema.index({ status: 1, at: -1 });
emailLogSchema.index({ kind: 1, at: -1 });
emailLogSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90-day TTL

export const EmailLog = monitoringConnection.model('EmailLog', emailLogSchema);
