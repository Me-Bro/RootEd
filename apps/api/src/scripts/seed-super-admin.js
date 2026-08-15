/**
 * seed-super-admin.js
 * Usage: node src/scripts/seed-super-admin.js --email=admin@rooted.app --password=SecurePass123
 *
 * Creates the first super admin user.
 * Exits with 0 on success, 1 on error.
 */

import '../config/env.js';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { hashPassword } from '../services/auth.service.js';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const [key, val] = arg.replace(/^--/, '').split('=');
    args[key] = val;
  }
  return args;
}

async function run() {
  const { email, password } = parseArgs();

  const resolvedEmail = email || process.env.SEED_SUPER_ADMIN_EMAIL;
  const resolvedPassword = password || process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!resolvedEmail || !resolvedPassword) {
    console.error(
      'Usage: node src/scripts/seed-super-admin.js --email=admin@rooted.app --password=SecurePass123'
    );
    console.error(
      'Alternatively set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD env vars.'
    );
    process.exit(1);
  }

  if (resolvedPassword.length < 8) {
    console.error('Password must be at least 8 characters');
    process.exit(1);
  }

  await mongoose.connect(env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ email: resolvedEmail }).lean();
  if (existing) {
    if (existing.systemRole === 'super_admin') {
      console.log(`Super admin already exists: ${resolvedEmail}`);
      await mongoose.disconnect();
      process.exit(0);
    }
    console.error(`User exists but is not a super_admin: ${resolvedEmail}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const passwordHash = await hashPassword(resolvedPassword);
  await User.create({
    email: resolvedEmail,
    passwordHash,
    systemRole: 'super_admin',
    status: 'active',
  });

  console.log(`Super admin created: ${resolvedEmail}`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
