import mongoose from 'mongoose';
import { ASSESSMENT_TYPES } from '@rooted/shared/constants';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const gradeSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'Term', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    assessmentType: { type: String, enum: ASSESSMENT_TYPES, default: 'final' },
    score: { type: Number, min: 0, max: 100 },
    letterGrade: { type: String },
    weightage: { type: Number, default: 1 },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    remarks: { type: String },
  },
  { timestamps: true }
);

gradeSchema.plugin(tenantScopePlugin);
gradeSchema.index(
  { tenantId: 1, studentId: 1, subjectId: 1, termId: 1, assessmentType: 1 },
  { unique: true }
);
gradeSchema.index({ tenantId: 1, sectionId: 1, subjectId: 1, termId: 1 });

export const Grade = mongoose.model('Grade', gradeSchema);
