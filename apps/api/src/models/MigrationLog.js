import mongoose from 'mongoose';

// Platform-level, not tenant data — same exemption as Tenant/User — so no
// tenantScopePlugin. One row per applied migration name; the unique index is
// what makes a racing second boot's insert fail instead of double-recording.
const migrationLogSchema = new mongoose.Schema({
  name: { type: String, required: true },
  appliedAt: { type: Date, default: Date.now },
});

migrationLogSchema.index({ name: 1 }, { unique: true });

export const MigrationLog = mongoose.model('MigrationLog', migrationLogSchema);
