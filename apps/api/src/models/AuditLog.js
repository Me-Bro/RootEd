import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }, // null = super-admin action
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    target: {
      model: { type: String },
      id: { type: mongoose.Schema.Types.ObjectId },
    },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: 'at', updatedAt: false },
  }
);

auditLogSchema.index({ tenantId: 1, at: -1 });
auditLogSchema.index({ tenantId: 1, actorId: 1, at: -1 });
auditLogSchema.index({ tenantId: 1, action: 1, at: -1 });
auditLogSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // 90-day TTL

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
