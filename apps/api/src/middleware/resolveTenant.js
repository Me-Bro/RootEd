import { Tenant } from '../models/Tenant.js';
import { AppError } from './errorHandler.js';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../services/auth.service.js';

export async function resolveTenant(req, res, next) {
  try {
    const host = req.hostname;
    const subdomain = host.replace(`.${env.APP_DOMAIN}`, '');

    if (subdomain && subdomain !== host) {
      const tenant = await Tenant.findOne({ subdomain, status: 'active' }).lean();
      if (!tenant) return next(new AppError('Tenant not found or suspended', 404));
      req.tenant = tenant;
      return next();
    }

    // No subdomain (general-portal host) — fall back to the tenantId claim
    // on the caller's access token, set by POST /auth/select-tenant. This is
    // only a peek to pick req.tenant; authenticate() still does the real
    // enforcement (blocklist/revocation) downstream in each tenant router.
    const tenant = await resolveTenantFromToken(req);
    if (!tenant) return next(new AppError('Tenant not found', 404));
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

export async function resolveTenantFromToken(req) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return null;
  }
  if (!payload.tenantId) return null;

  const tenant = await Tenant.findById(payload.tenantId).lean();
  return tenant?.status === 'active' ? tenant : null;
}
