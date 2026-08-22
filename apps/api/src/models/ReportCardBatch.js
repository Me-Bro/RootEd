import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const reportCardBatchSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term', required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: String, required: true },
    status: { type: String, enum: ['queued', 'completed', 'failed'], default: 'queued' },
    s3Key: { type: String },
    error: { type: String },
  },
  { timestamps: true }
);

reportCardBatchSchema.plugin(tenantScopePlugin);
reportCardBatchSchema.index({ tenantId: 1, sectionId: 1, termId: 1, createdAt: -1 });
reportCardBatchSchema.index({ jobId: 1 });
// Batches are a generation history, not a system of record — auto-expire so
// stale rows (and the orphaned S3 objects they point at) don't accumulate
// forever. The S3 object itself still needs a bucket lifecycle rule since
// Mongo TTL only cleans up this metadata row, not the uploaded PDF.
reportCardBatchSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export const ReportCardBatch = mongoose.model('ReportCardBatch', reportCardBatchSchema);
