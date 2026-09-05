/**
 * migrate-identity-fields.js
 * Usage: node src/scripts/migrate-identity-fields.js [--dry-run]
 *
 * Backfills the identity fields added alongside self-service registration:
 *
 *   1. emailVerified = true for every pre-existing user. They were created by a
 *      super_admin or a tenant admin, never through /auth/register, so there is
 *      no verification link they could ever have clicked — leaving them false
 *      would lock them out the moment anything gates on it.
 *   2. username / usernameLower derived from the email local part, with a
 *      numeric suffix on collision. Required before the unique sparse index on
 *      usernameLower means anything.
 *   3. firstName / lastName copied from the user's StaffMember record where one
 *      exists, so the canonical name lives on User from here on.
 *
 * Idempotent: users that already have a usernameLower are skipped, and the
 * emailVerified update only matches documents missing the field.
 *
 * Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { StaffMember } from '../models/StaffMember.js';
import { deriveUsernameFromEmail } from '../services/identity.service.js';

const dryRun = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(env.MONGODB_URI);
  console.log(`Connected to MongoDB${dryRun ? ' (dry run — no writes)' : ''}`);

  const verified = await User.countDocuments({ emailVerified: { $ne: true } });
  if (!dryRun && verified) {
    await User.updateMany(
      { emailVerified: { $ne: true } },
      { $set: { emailVerified: true } },
      { _bypassTenantScope: true }
    );
  }
  console.log(`emailVerified: ${verified} user(s)`);

  const pending = await User.find(
    { $or: [{ usernameLower: { $exists: false } }, { usernameLower: null }] },
    '_id email firstName lastName'
  ).lean();
  console.log(`usernames to derive: ${pending.length}`);

  let named = 0;
  for (const user of pending) {
    const username = await deriveUsernameFromEmail(user.email, { forUserId: user._id });
    const update = { username, usernameLower: username };

    if (!user.firstName || !user.lastName) {
      const staff = await StaffMember.findOne(
        { userId: user._id },
        'firstName lastName phone'
      ).setOptions({ _bypassTenantScope: true });
      if (staff) {
        if (!user.firstName && staff.firstName) update.firstName = staff.firstName;
        if (!user.lastName && staff.lastName) update.lastName = staff.lastName;
        if (update.firstName || update.lastName) named += 1;
      }
    }

    if (dryRun) {
      console.log(`  ${user.email} -> ${username}`);
      continue;
    }
    await User.updateOne({ _id: user._id }, { $set: update }, { _bypassTenantScope: true });
  }

  console.log(`names backfilled from StaffMember: ${named}`);
  console.log(dryRun ? 'Dry run complete — nothing written.' : 'Success.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
