import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const leaveBalanceSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffMember', required: true },
    leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    year: { type: Number, required: true },
    total: { type: Number, required: true },
    used: { type: Number, default: 0 },
  },
  { timestamps: true }
);

leaveBalanceSchema.plugin(tenantScopePlugin);
leaveBalanceSchema.index(
  { tenantId: 1, staffId: 1, leaveTypeId: 1, year: 1 },
  { unique: true }
);

export const LeaveBalance = mongoose.model('LeaveBalance', leaveBalanceSchema);
