import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// A piece of practical work set for one batch (Section) in one module (Subject)
// during one programme run (Term). Trainers record each student's result as a
// Submission.
const assignmentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    dueDate: { type: Date, required: true },
    maxScore: { type: Number, default: 10, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

assignmentSchema.plugin(tenantScopePlugin);
assignmentSchema.index({ tenantId: 1, sectionId: 1, termId: 1, dueDate: 1 });

export const Assignment = mongoose.model('Assignment', assignmentSchema);
