import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';
import { env } from '../config/env.js';
import { deriveUsernameFromEmail } from './identity.service.js';

let client;
function getClient() {
  if (!client) client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  return client;
}

/**
 * Verifies a Google Identity Services ID token and returns its payload.
 * Deliberately reports the same generic failure for every rejection reason
 * (expired, tampered, wrong audience, unverified email) — matching how a
 * failed password login gives no hint which check failed.
 */
export async function verifyGoogleIdToken(idToken) {
  let ticket;
  try {
    ticket = await getClient().verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
  } catch {
    throw new AppError('Invalid credentials', 401);
  }

  const payload = ticket.getPayload();
  if (!payload?.email || payload.email_verified !== true) {
    throw new AppError('Invalid credentials', 401);
  }

  return payload;
}

/**
 * Finds the User matching a Google-verified email, auto-linking googleId
 * onto it, or creates one if none exists. Applies the same account-status
 * rules POST /auth/login applies, except a pending_verification account is
 * activated instead of blocked — Google already proved control of the
 * address, which is exactly what email verification was gating.
 */
export async function findOrCreateGoogleUser({ email, googleId, firstName, lastName }) {
  const existing = await User.findOne({ email }).select('+mfaSecret');

  if (!existing) {
    const username = await deriveUsernameFromEmail(email);
    const user = await User.create({
      email,
      username,
      usernameLower: username,
      firstName,
      lastName,
      googleId,
      status: 'active',
      emailVerified: true,
    });
    return { user, created: true };
  }

  if (existing.status === 'deleted') throw new AppError('Invalid credentials', 401);
  if (existing.status === 'suspended') throw new AppError('Account suspended', 403);

  existing.googleId = googleId;
  if (existing.status === 'pending_verification') existing.status = 'active';
  if (!existing.emailVerified) existing.emailVerified = true;
  await existing.save({ _bypassTenantScope: true });

  return { user: existing, created: false };
}
