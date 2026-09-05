import mongoose from 'mongoose';

// Global, not tenant-scoped: usernames are one namespace across the whole
// workspace, so this model deliberately does not use tenantScopePlugin.
//
// A released username is parked here rather than freed immediately. Without
// that, a teacher who renames away from `principal.sharma` frees the handle for
// anyone to claim and impersonate them in a members list. The TTL index expires
// rows on `expiresAt`, which frees the handle again automatically.
const usernameHistorySchema = new mongoose.Schema(
  {
    usernameLower: { type: String, required: true, lowercase: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    releasedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

usernameHistorySchema.index({ usernameLower: 1 });
usernameHistorySchema.index({ userId: 1 });
// Mongo's TTL monitor deletes the row once expiresAt passes.
usernameHistorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UsernameHistory = mongoose.model('UsernameHistory', usernameHistorySchema);
