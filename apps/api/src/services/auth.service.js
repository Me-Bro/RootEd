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

export function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Only the SHA-256 digest is persisted — the raw token exists solely in the
// email we send. A database dump, backup or log leak therefore can't be
// replayed against /auth/reset-password. The digest of a 256-bit random value
// needs no salt or slow KDF: there is nothing to brute-force.
export function hashResetToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function storeResetToken(userId, token, ttlMs = RESET_TOKEN_TTL_MS) {
  const expires = new Date(Date.now() + ttlMs);
  await User.updateOne(
    { _id: userId },
    { passwordResetToken: hashResetToken(token), passwordResetExpires: expires },
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
