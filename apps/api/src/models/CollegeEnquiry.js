import mongoose from 'mongoose';
import { ENQUIRY_PROGRAMMES, ENQUIRY_STATUSES } from '@rooted/shared/constants';

// A college asking for a proposal on the public Career Catalyst page. Like
// Feedback it belongs to the platform, not to a tenant (the sender has none
// yet), so it deliberately does not use the tenantScope plugin.
const collegeEnquirySchema = new mongoose.Schema(
  {
    contactName: { type: String, required: true },
    collegeName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    programme: { type: String, enum: ENQUIRY_PROGRAMMES, default: 'not_sure' },
    message: { type: String },
    status: { type: String, enum: ENQUIRY_STATUSES, default: 'new' },
    adminNote: { type: String },
  },
  { timestamps: true }
);

collegeEnquirySchema.index({ status: 1, createdAt: -1 });

export const CollegeEnquiry = mongoose.model('CollegeEnquiry', collegeEnquirySchema);
