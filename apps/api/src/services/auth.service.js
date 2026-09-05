import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Tenant } from '../models/Tenant.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';

const LOCKOUT_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export async function hashPassword(password) {
  return argon2.hash(password);
}

export async function verifyPassword(hash, password) {
  return argon2.verify(hash, password);
}

export function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

export async function blockToken(token, expiresInSeconds) {
  await redis.setex(`blocklist:${token}`, expiresInSeconds, '1');
}

// Invalidates every access token issued to this user before now, by the same
// mechanism the revoke-all-sessions runbook uses: authenticate() compares each
// token's `iat` against this timestamp. TTL matches the refresh-token lifetime,
// after which no live token can predate it anyway.
export async function revokeUserSessions(userId) {
  // +1s is defensive, not a fix for an observed failure. authenticate() tests
  // `iat < revokedAt` and `iat` only has one-second resolution, so a token
  // minted during this same second would otherwise survive the revoke. In
  // practice a login and a password change are separated by more than a
  // second, but that is timing, not a guarantee.
  await redis.setex(
    `blocklist:user:${userId}`,
    7 * 24 * 60 * 60,
    String(Math.floor(Date.now() / 1000) + 1)
  );
}

export async function isTokenBlocked(token) {
  const val = await redis.get(`blocklist:${token}`);
  return val === '1';
}

export async function handleFailedLogin(user) {
  const now = Date.now();
  const lockedUntil = user.lockedUntil ? new Date(user.lockedUntil).getTime() : 0;

  if (lockedUntil > now) throw new AppError('Account locked. Try again later.', 429);

  const attempts = user.failedLoginAttempts + 1;
  const updateData = { failedLoginAttempts: attempts };

  if (attempts >= LOCKOUT_ATTEMPTS) {
    const backoffMs = Math.min(
      LOCKOUT_WINDOW_MS * Math.pow(2, attempts - LOCKOUT_ATTEMPTS),
      24 * 60 * 60 * 1000
    );
    updateData.lockedUntil = new Date(now + backoffMs);
  }

  await User.updateOne({ _id: user._id }, updateData, { _bypassTenantScope: true });
  throw new AppError('Invalid email or password', 401);
}

export async function clearFailedLogins(userId) {
  await User.updateOne(
    { _id: userId },
    { failedLoginAttempts: 0, lockedUntil: null },
    { _bypassTenantScope: true }
  );
}

export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
export const INVITE_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Shared by every single-use token we mail out: password reset, invite
// acceptance, email verification and email change. Only the SHA-256 digest is
// persisted — the raw token exists solely in the email — so a database dump,
// backup or log leak can't be replayed. The digest of a 256-bit random value
// needs no salt or slow KDF: there is nothing to brute-force.
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function storeResetToken(userId, token, ttlMs = RESET_TOKEN_TTL_MS) {
  const expires = new Date(Date.now() + ttlMs);
  await User.updateOne(
    { _id: userId },
    { passwordResetToken: hashToken(token), passwordResetExpires: expires },
    { _bypassTenantScope: true }
  );
}

export async function getActiveTenantsForUser(userId) {
  const memberships = await TenantMembership.find({ userId, status: 'active' }, 'tenantId', {
    _bypassTenantScope: true,
  }).lean();
  if (memberships.length === 0) return [];

  const tenantIds = memberships.map((m) => m.tenantId);
  const tenants = await Tenant.find(
    { _id: { $in: tenantIds }, status: 'active' },
    '_id name subdomain'
  ).lean();

  return tenants.map((t) => ({
    _id: t._id.toString(),
    name: t.name,
    subdomain: t.subdomain,
  }));
}
