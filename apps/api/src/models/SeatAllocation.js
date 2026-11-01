import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// A member's standing hold on one seat for one shift (a Section). Two members may
// hold the same chair in different shifts; the same chair can never be held twice
// in one shift, and one member holds one chair per shift. Both rules are partial
// unique indexes over `active` rows, so the database decides a race, not the app.
// A walk-in never has one: a day pass is a seat chosen at check-in (phase 4).
const seatAllocationSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    seatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seat', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true },
    status: { type: String, enum: ['active', 'ended'], default: 'active' },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
  },
  { timestamps: true }
);

seatAllocationSchema.plugin(tenantScopePlugin);
// partialFilterExpression takes equality only, so these index `status: 'active'`
// rather than "not ended".
seatAllocationSchema.index(
  { tenantId: 1, seatId: 1, sectionId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
seatAllocationSchema.index(
  { tenantId: 1, studentId: 1, sectionId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
seatAllocationSchema.index({ tenantId: 1, sectionId: 1, status: 1 });

export const SeatAllocation = mongoose.model('SeatAllocation', seatAllocationSchema);
