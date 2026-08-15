import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const leaveTypeSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true },
    maxDaysPerYear: { type: Number, required: true },
    isPaid: { type: Boolean, default: true },
    requiresApproval: { type: Boolean, default: true },
  },
  { timestamps: true }
);

leaveTypeSchema.plugin(tenantScopePlugin);

export const LeaveType = mongoose.model('LeaveType', leaveTypeSchema);

export const DEFAULT_LEAVE_TYPES = [
  { name: 'Casual', maxDaysPerYear: 12, isPaid: true, requiresApproval: true },
  { name: 'Sick', maxDaysPerYear: 10, isPaid: true, requiresApproval: true },
  { name: 'Earned', maxDaysPerYear: 15, isPaid: true, requiresApproval: true },
  { name: 'Unpaid', maxDaysPerYear: 30, isPaid: false, requiresApproval: true },
];
