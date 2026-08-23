import mongoose from 'mongoose';
import { tenantScopePlugin } from './plugins/tenantScope.js';

const documentSchema = new mongoose.Schema(
  {
    name: String,
    key: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const studentSchema = new mongoose.Schema(
  {
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    admissionNo: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    parentContacts: [
      {
        name: { type: String },
        phone: { type: String },
        relation: { type: String },
      },
    ],
    status: { type: String, enum: ['active', 'graduated', 'withdrawn'], default: 'active' },
    photoKey: { type: String },
    documents: [documentSchema],
  },
  { timestamps: true }
);

studentSchema.plugin(tenantScopePlugin);
studentSchema.index({ tenantId: 1, admissionNo: 1 }, { unique: true });
studentSchema.index({ tenantId: 1, sectionId: 1 });

export const Student = mongoose.model('Student', studentSchema);
