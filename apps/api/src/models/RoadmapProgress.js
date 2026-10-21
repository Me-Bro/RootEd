import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// One student's work on one RoadmapItem. A row means started or answered;
// `completedAt` set means complete. A student with no row has done nothing, and
// absence is never the same as complete.
const roadmapProgressSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    roadmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Roadmap', required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoadmapItem', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    completedAt: { type: Date, default: null },
    answer: { type: String },
    linkUrl: { type: String },
  },
  { timestamps: true }
);

roadmapProgressSchema.plugin(tenantScopePlugin);
roadmapProgressSchema.index({ tenantId: 1, itemId: 1, studentId: 1 }, { unique: true });
roadmapProgressSchema.index({ tenantId: 1, roadmapId: 1, studentId: 1 });

export const RoadmapProgress = mongoose.model('RoadmapProgress', roadmapProgressSchema);
