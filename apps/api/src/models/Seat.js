import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

// One physical chair in a study center. Whether it is free is not stored: it is
// derived per shift from SeatAllocation (standing holds) and, from phase 4, from
// open Visits, so there is no second place for that fact to drift.
const seatSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    label: { type: String, required: true, trim: true },
    zone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

seatSchema.plugin(tenantScopePlugin);
seatSchema.index({ tenantId: 1, label: 1 }, { unique: true });

export const Seat = mongoose.model('Seat', seatSchema);
