import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// Who teaches one module to one batch during one programme run. Kept apart from
// Subject (the same module is taught by different people in different batches)
// and from Timetable (which needs a year, day, period and times).
const subjectTeacherSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

subjectTeacherSchema.plugin(tenantScopePlugin);
subjectTeacherSchema.index(
  { tenantId: 1, subjectId: 1, sectionId: 1, termId: 1 },
  { unique: true }
);
subjectTeacherSchema.index({ tenantId: 1, sectionId: 1, termId: 1 });

export const SubjectTeacher = mongoose.model('SubjectTeacher', subjectTeacherSchema);
