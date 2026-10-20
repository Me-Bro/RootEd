import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const milestoneSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    dueDate: { type: Date },
    doneAt: { type: Date },
  },
  { _id: false }
);

// A team project for one batch in one programme run.
const projectSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term', required: true },
    name: { type: String, required: true, trim: true },
    repoUrl: { type: String },
    memberIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    milestones: [milestoneSchema],
    demoDate: { type: Date },
    // Kept on the project, not per member: removing a member after the review
    // must not erase the review.
    reviewScore: { type: Number, min: 0, max: 100, default: null },
    reviewNotes: { type: String },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

projectSchema.plugin(tenantScopePlugin);
projectSchema.index({ tenantId: 1, sectionId: 1, termId: 1 });

export const Project = mongoose.model('Project', projectSchema);
