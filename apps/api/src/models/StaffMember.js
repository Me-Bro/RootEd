import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const qualificationSchema = new mongoose.Schema({
  degree: String,
  institution: String,
  year: Number,
}, { _id: false });

const documentSchema = new mongoose.Schema({
  name: String,
  key: String,
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

const staffMemberSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    employeeId: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    phone: { type: String },
    address: { type: String },
    designation: { type: String },
    department: { type: String },
    reportingManagerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    joiningDate: { type: Date },
    employmentStatus: {
      type: String,
      enum: ['active', 'resigned', 'terminated', 'on_leave'],
      default: 'active',
    },
    qualifications: [qualificationSchema],
    documents: [documentSchema],
    governmentId: { type: String },
    bankAccount: { type: String },
    salaryStructureId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure' },
  },
  { timestamps: true }
);

staffMemberSchema.plugin(tenantScopePlugin);
staffMemberSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
staffMemberSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true, sparse: true });
staffMemberSchema.index({ tenantId: 1, department: 1 });

export const StaffMember = mongoose.model('StaffMember', staffMemberSchema);
