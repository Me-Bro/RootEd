import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const approvalStepSchema = new mongoose.Schema({
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  actedAt: { type: Date },
  comment: { type: String },
}, { _id: false });

const leaveRequestSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffMember', required: true },
    leaveTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    totalDays: { type: Number, required: true },
    reason: { type: String },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    approvalChain: [approvalStepSchema],
    currentApproverIndex: { type: Number, default: 0 },
    conflictFlags: [{ type: String }],
  },
  { timestamps: true }
);

leaveRequestSchema.plugin(tenantScopePlugin);
leaveRequestSchema.index({ tenantId: 1, staffId: 1, status: 1 });
leaveRequestSchema.index({ tenantId: 1, status: 1, fromDate: 1 });

export const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);
