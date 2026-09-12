import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// Explicit roster membership, separate from Student.sectionId (a school/college
// student's single homeroom). A coaching/tuition/study-center learner can be
// active in several sections ("batches") at once — one Enrollment row per
// (student, section) makes that many-to-many relationship queryable without
// touching Grade/Attendance/Timetable, which already key off sectionId per
// record rather than off Student.sectionId.
const enrollmentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    status: { type: String, enum: ['active', 'completed', 'dropped'], default: 'active' },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    enrolledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
  },
  { timestamps: true }
);

enrollmentSchema.plugin(tenantScopePlugin);
enrollmentSchema.index({ tenantId: 1, studentId: 1, sectionId: 1 }, { unique: true });
enrollmentSchema.index({ tenantId: 1, sectionId: 1, status: 1 });
enrollmentSchema.index({ tenantId: 1, studentId: 1, status: 1 });

export const Enrollment = mongoose.model('Enrollment', enrollmentSchema);
