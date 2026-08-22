import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const timetablePublishSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    publishedAt: { type: Date, default: () => new Date() },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

timetablePublishSchema.plugin(tenantScopePlugin);
timetablePublishSchema.index({ tenantId: 1, academicYearId: 1, sectionId: 1 }, { unique: true });

export const TimetablePublish = mongoose.model('TimetablePublish', timetablePublishSchema);
