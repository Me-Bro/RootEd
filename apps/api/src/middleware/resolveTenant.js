import { Tenant } from '../models/Tenant.js';
import { AppError } from './errorHandler.js';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../services/auth.service.js';

// Splits a request's Host header into a candidate subdomain and whether it should
// be treated as the general-portal host: the bare APP_DOMAIN (no subdomain at all)
// or the configured PORTAL_SUBDOMAIN label — either way, there's no real tenant to
// look up by subdomain, so callers should fall back to the token's tenant claim.
export function getSubdomainInfo(req) {
  const host = req.hostname;
  const subdomain = host.replace(`.${env.APP_DOMAIN}`, '');
  const isPortalHost =
    subdomain === host || (env.PORTAL_SUBDOMAIN && subdomain === env.PORTAL_SUBDOMAIN);
  return { subdomain, isPortalHost };
}

export async function resolveTenant(req, res, next) {
  try {
    const { subdomain, isPortalHost } = getSubdomainInfo(req);

    if (!isPortalHost) {
      const tenant = await Tenant.findOne({ subdomain, status: 'active' }).lean();
      if (!tenant) return next(new AppError('Tenant not found or suspended', 404));
      req.tenant = tenant;
      return next();
    }

    // General-portal host (bare APP_DOMAIN or PORTAL_SUBDOMAIN) — fall back to the
    // tenantId/impersonatedTenantId claim on the caller's access token, set by
    // POST /auth/select-tenant or POST /admin/tenants/:id/impersonate. This is
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
  const tenantId = payload.tenantId ?? payload.impersonatedTenantId;
  if (!tenantId) return null;

  const tenant = await Tenant.findById(tenantId).lean();
  return tenant?.status === 'active' ? tenant : null;
}
