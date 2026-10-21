import mongoose from 'mongoose';
import { ROADMAP_ITEM_TYPES } from '@rooted/shared/constants';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// One step on a Roadmap. Exactly the schedule field matching the roadmap's
// scheduleMode is set (dueDate | dayNumber | weekNumber); the route enforces it.
const roadmapItemSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    roadmapId: { type: mongoose.Schema.Types.ObjectId, ref: 'Roadmap', required: true },
    // Denormalised from the roadmap so a student's items load by batch alone.
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    type: { type: String, enum: ROADMAP_ITEM_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String },
    resourceUrl: { type: String },
    // The question the student answers on this item.
    prompt: { type: String },
    order: { type: Number, required: true },
    dueDate: { type: Date },
    dayNumber: { type: Number },
    weekNumber: { type: Number },
    // Open iff !locked, or every id in unlockAfter is completed. Locked with
    // nothing in unlockAfter is a hold the mentor lifts by hand.
    locked: { type: Boolean, default: false },
    unlockAfter: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RoadmapItem' }],
  },
  { timestamps: true }
);

roadmapItemSchema.plugin(tenantScopePlugin);
roadmapItemSchema.index({ tenantId: 1, roadmapId: 1, order: 1 });
roadmapItemSchema.index({ tenantId: 1, sectionId: 1 });

export const RoadmapItem = mongoose.model('RoadmapItem', roadmapItemSchema);
