import { verifyAccessToken, isTokenBlocked } from '../services/auth.service.js';
import { redis } from '../config/redis.js';
import { AppError } from './errorHandler.js';

export async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) throw new AppError('Missing token', 401);

    const token = authHeader.slice(7);
    if (await isTokenBlocked(token)) throw new AppError('Token revoked', 401);

    const payload = verifyAccessToken(token);

    // Per-user session revocation check (set by revoke-all-sessions runbook)
    const userBlocklistKey = `blocklist:user:${payload.sub}`;
    const revokedAt = await redis.get(userBlocklistKey);
    if (revokedAt && payload.iat && payload.iat < Number(revokedAt)) {
      throw new AppError('Token revoked', 401);
    }

    req.user = payload;
    req.token = token;
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError('Invalid or expired token', 401));
  }
}

export function requireSystemRole(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user?.systemRole)) {
      return next(new AppError('Forbidden', 403));
    }
    next();
  };
}
