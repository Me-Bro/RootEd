import mongoose from 'mongoose';
import { USER_STATUS } from '@rooted/shared/constants';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    // An email change is a two-phase confirm: the new address lands here and
    // only replaces `email` once the token mailed to it comes back. Mutating
    // `email` directly from a session would make a stolen session a permanent
    // account takeover.
    pendingEmail: { type: String, lowercase: true, trim: true },
    pendingEmailToken: { type: String, select: false },
    pendingEmailExpires: { type: Date, select: false },
    // `username` keeps the casing the user typed for display; `usernameLower`
    // is what's actually unique and what lookups go through.
    username: { type: String, trim: true },
    usernameLower: { type: String, lowercase: true, trim: true },
    usernameChangedAt: { type: Date },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String, trim: true },
    avatarKey: { type: String },
    passwordHash: { type: String, required: true, select: false },
    systemRole: {
      type: String,
      enum: ['super_admin', 'support_agent', null],
      default: null,
    },
    status: {
      type: String,
      enum: USER_STATUS,
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
userSchema.index({ usernameLower: 1 }, { unique: true, sparse: true });
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ pendingEmailToken: 1 }, { sparse: true });

export const User = mongoose.model('User', userSchema);
