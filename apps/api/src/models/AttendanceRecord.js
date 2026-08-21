import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const attendanceRecordSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    date: { type: Date, required: true },
    entityType: { type: String, enum: ['student', 'staff'], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId },
    subjectId: { type: mongoose.Schema.Types.ObjectId },
    status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String },
  },
  { timestamps: true }
);

attendanceRecordSchema.plugin(tenantScopePlugin);
// subjectId included so each period/subject gets its own record per day —
// absent/null subjectId (staff attendance, or no period selected) still
// collapses to one record per day since null is a single index value.
attendanceRecordSchema.index(
  { tenantId: 1, date: 1, entityType: 1, entityId: 1, subjectId: 1 },
  { unique: true }
);
attendanceRecordSchema.index({ tenantId: 1, sectionId: 1, date: 1 });

export const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceRecordSchema);
