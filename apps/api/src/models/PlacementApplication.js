import mongoose from 'mongoose';
import { PLACEMENT_STAGES } from '@rooted/shared/constants';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// One student's application to one employer for one role. Each stage reached
// keeps its own date, so applications, interviews, offers and joinings can be
// reported separately rather than as a single "placed" figure.
const placementApplicationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employer', required: true },
    role: { type: String, required: true, trim: true },
    stage: { type: String, enum: PLACEMENT_STAGES, default: 'applied' },
    appliedAt: { type: Date, default: Date.now },
    interviewedAt: { type: Date },
    offeredAt: { type: Date },
    joinedAt: { type: Date },
    // When the application was closed without a joining (rejected/withdrawn).
    closedAt: { type: Date },
    notes: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

placementApplicationSchema.plugin(tenantScopePlugin);
placementApplicationSchema.index(
  { tenantId: 1, studentId: 1, employerId: 1, role: 1 },
  { unique: true }
);
placementApplicationSchema.index({ tenantId: 1, stage: 1 });

export const PlacementApplication = mongoose.model(
  'PlacementApplication',
  placementApplicationSchema
);
