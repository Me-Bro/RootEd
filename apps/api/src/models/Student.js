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
    // Optional: a student record is the school's, a login is something the
    // student may later claim. Mandatory accounts would force synthetic emails
    // and have no answer for a pupil too young to have one.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
// partialFilterExpression, not sparse. A *compound* sparse index still indexes
// documents where any indexed field is present — tenantId always is — so
// `sparse` would treat every roster student without a linked account as
// userId: null and collide on the second one. This indexes only the rows that
// actually carry a link.
studentSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);

export const Student = mongoose.model('Student', studentSchema);
