import mongoose from 'mongoose';
import { monitoringConnection } from '../config/monitoringDb.js';

// Lives on a separate Mongo connection/database from every other model (see
// config/monitoringDb.js) — deliberately not tenantScopePlugin'd. A super-admin
// viewer needs to query across tenants, and tenant-agnostic requests (/auth,
// /admin) have no tenantId at all. Being on its own connection also means a
// stray unscoped query here can never touch tenant data, since it isn't even
// the same database.
const requestLogSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId },
    tenantSubdomain: { type: String },
    module: { type: String },
    method: { type: String, required: true },
    path: { type: String, required: true },
    statusCode: { type: Number, required: true },
    durationMs: { type: Number, required: true },
    ip: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId },
    userEmail: { type: String },
    userAgent: { type: String },
    traceId: { type: String },
  },
  {
    timestamps: { createdAt: 'at', updatedAt: false },
  }
);

requestLogSchema.index({ tenantId: 1, at: -1 });
requestLogSchema.index({ ip: 1, at: -1 });
requestLogSchema.index({ module: 1, at: -1 });
requestLogSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // 30-day TTL

export const RequestLog = monitoringConnection.model('RequestLog', requestLogSchema);
