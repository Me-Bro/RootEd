import { signAccessToken, signRefreshToken } from '../services/auth.service.js';
import { env } from '../config/env.js';

export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

/**
 * Issues an access token scoped to one tenant and sets the matching refresh
 * cookie. Shared by POST /auth/select-tenant, invite acceptance, join-code
 * auto-approval and organization creation — all of which have to hand back a
 * session pointing at a specific tenant, and none of which should be carrying
 * their own copy of the cookie options.
 */
export function issueTenantSession(res, { sub, systemRole, tenantId }) {
  const payload = { sub, systemRole, tenantId: tenantId.toString() };
  res.cookie('refreshToken', signRefreshToken(payload), REFRESH_COOKIE_OPTIONS);
  return signAccessToken(payload);
}
