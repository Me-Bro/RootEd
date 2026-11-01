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
    // Ten digits, normalized by indianMobileSchema. Contact for the learner
    // themselves (parentContacts[].phone is a guardian's). Not unique: families
    // share a phone. Cleared by account deletion and by the walk-in erase action.
    phone: { type: String, trim: true },
    // A study-center visitor who buys a day pass is a Student too, so fees and
    // attendance need no second person model. Written only by the walk-in route;
    // legacy rows have no value, so readers filter with $ne, never equality.
    kind: { type: String, enum: ['member', 'walk_in'], default: 'member' },
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
    // Whether the student agreed to share their resume and scores with
    // employers. Written only by PUT /training/students/:id/consent — never by
    // the generic student update, which does not whitelist it.
    placementConsent: {
      granted: { type: Boolean },
      at: { type: Date },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    documents: [documentSchema],
  },
  { timestamps: true }
);

studentSchema.plugin(tenantScopePlugin);
studentSchema.index({ tenantId: 1, admissionNo: 1 }, { unique: true });
studentSchema.index({ tenantId: 1, sectionId: 1 });
studentSchema.index({ tenantId: 1, phone: 1 });
// One walk-in per phone, so two desks registering the same visitor at once
// cannot both succeed. Members are excluded: a family shares a phone.
studentSchema.index(
  { tenantId: 1, kind: 1, phone: 1 },
  { unique: true, partialFilterExpression: { kind: 'walk_in', phone: { $type: 'string' } } }
);
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
