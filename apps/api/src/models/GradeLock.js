import mongoose from 'mongoose';
import { ASSESSMENT_TYPES } from '@rooted/shared/constants';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const gradeLockSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term', required: true },
    assessmentType: { type: String, enum: ASSESSMENT_TYPES, default: 'final' },
    publishedAt: { type: Date, default: () => new Date() },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

gradeLockSchema.plugin(tenantScopePlugin);
gradeLockSchema.index(
  { tenantId: 1, sectionId: 1, subjectId: 1, termId: 1, assessmentType: 1 },
  { unique: true }
);

export const GradeLock = mongoose.model('GradeLock', gradeLockSchema);
