import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const timetableSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dayOfWeek: { type: Number, enum: [0, 1, 2, 3, 4, 5, 6], required: true },
    periodNumber: { type: Number, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  { timestamps: true }
);

timetableSchema.plugin(tenantScopePlugin);
timetableSchema.index({ tenantId: 1, academicYearId: 1, sectionId: 1 });
timetableSchema.index({ tenantId: 1, teacherId: 1, dayOfWeek: 1 });

export const Timetable = mongoose.model('Timetable', timetableSchema);
