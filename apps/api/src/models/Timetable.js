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
    room: { type: String, trim: true },
  },
  { timestamps: true }
);

timetableSchema.plugin(tenantScopePlugin);
timetableSchema.index(
  { tenantId: 1, academicYearId: 1, sectionId: 1, dayOfWeek: 1, periodNumber: 1 },
  { unique: true }
);
timetableSchema.index(
  { tenantId: 1, academicYearId: 1, teacherId: 1, dayOfWeek: 1, periodNumber: 1 },
  { unique: true }
);
timetableSchema.index(
  { tenantId: 1, academicYearId: 1, room: 1, dayOfWeek: 1, periodNumber: 1 },
  { unique: true, partialFilterExpression: { room: { $exists: true, $type: 'string' } } }
);

export const Timetable = mongoose.model('Timetable', timetableSchema);
