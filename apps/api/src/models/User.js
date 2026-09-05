import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    systemRole: {
      type: String,
      enum: ['super_admin', 'support_agent', null],
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'suspended'],
      default: 'invited',
    },
    mfaSecret: { type: String, select: false },
    mfaEnabled: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
// Reset/invite acceptance looks users up by this digest — without an index it
// is a full collection scan on every attempt.
userSchema.index({ passwordResetToken: 1 }, { sparse: true });

export const User = mongoose.model('User', userSchema);
