import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// One stay at a study center: a learner on a seat from `inAt` to `outAt`. An open
// visit (outAt unset) is who is on a seat right now. `isOpen` exists only so the two
// partial unique indexes below can say "one open visit per seat and per learner":
// a partial index cannot match on a null `outAt`, so the flag is set on check-in and
// removed on check-out. The database then settles two desks taking one seat at once.
const visitSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    seatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seat', required: true },
    inAt: { type: Date, required: true },
    outAt: { type: Date },
    isOpen: { type: Boolean },
    method: { type: String, enum: ['manual', 'qr'], default: 'manual' },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Closed by the sweeper because nobody checked the learner out.
    autoClosed: { type: Boolean, default: false },
    // Checked in outside opening hours, which only an owner may do.
    outsideHours: { type: Boolean, default: false },
    // valid | unpaid | expired | none, as it stood at check-in.
    entitlementAtCheckIn: { type: String, enum: ['valid', 'unpaid', 'expired', 'none'] },
  },
  { timestamps: true }
);

visitSchema.plugin(tenantScopePlugin);
visitSchema.index(
  { tenantId: 1, seatId: 1 },
  { unique: true, partialFilterExpression: { isOpen: true } }
);
visitSchema.index(
  { tenantId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { isOpen: true } }
);
visitSchema.index({ tenantId: 1, inAt: -1 });
visitSchema.index({ tenantId: 1, studentId: 1, inAt: -1 });

export const Visit = mongoose.model('Visit', visitSchema);
