import mongoose from 'mongoose';

const featureFlagSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    enabled: { type: Boolean, default: false },
    description: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

featureFlagSchema.index({ key: 1 }, { unique: true });

export const FeatureFlag = mongoose.model('FeatureFlag', featureFlagSchema);
