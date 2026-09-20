import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ['contact', 'feedback', 'bug', 'other'],
      default: 'other',
    },
    name: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }, // null = public/anonymous
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null = anonymous
    status: {
      type: String,
      enum: ['new', 'in_progress', 'resolved'],
      default: 'new',
    },
    adminNote: { type: String },
  },
  { timestamps: true }
);

feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ tenantId: 1, createdAt: -1 });

export const Feedback = mongoose.model('Feedback', feedbackSchema);
