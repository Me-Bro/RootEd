import mongoose from 'mongoose';
import { ROADMAP_SCHEDULE_MODES } from '@rooted/shared/constants';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// A mentor's learning path for one batch (Section) in one programme run (Term).
// A batch may hold several (a theory track, a lab track). Students see it only
// once it is published. It is a self-reported learning path: never scored, and
// it does not feed readiness.
const roadmapSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    // One mode per roadmap; it decides which schedule field each item carries.
    scheduleMode: { type: String, enum: ROADMAP_SCHEDULE_MODES, default: 'none' },
    // Day 1 / week 1 of a daily or weekly roadmap. Display only; falls back to
    // the term's start date.
    startDate: { type: Date },
    published: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

roadmapSchema.plugin(tenantScopePlugin);
roadmapSchema.index({ tenantId: 1, sectionId: 1, termId: 1 });

export const Roadmap = mongoose.model('Roadmap', roadmapSchema);
