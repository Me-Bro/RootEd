import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/User.js';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  blockToken,
  isTokenBlocked,
  handleFailedLogin,
  clearFailedLogins,
  generateResetToken,
  storeResetToken,
  getActiveTenantsForUser,
} from '../services/auth.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { resolvePermissions, effectivePermissionsFor } from '../middleware/requirePermission.js';
import { resolveTenantFromToken, getSubdomainInfo } from '../middleware/resolveTenant.js';
import { Tenant } from '../models/Tenant.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { env } from '../config/env.js';
import { auditLog } from '../services/audit.service.js';
import {
  generateMfaSecret,
  verifyMfaToken,
  enableMfa,
  getMfaSecret,
} from '../services/mfa.service.js';
import { sendPasswordReset } from '../services/email.service.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 10 : 500,
  message: { error: 'Too many login attempts' },
});

const mfaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many MFA requests, try again in an hour' },
});

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totpCode: z.string().optional(),
});

const forgotSchema = z.object({ email: z.string().email() });

const selectTenantSchema = z.object({ tenantId: z.string() });

const resetSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Authenticate user and get access token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               totpCode:
 *                 type: string
 *                 description: TOTP code (required for super_admin with MFA enabled)
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: Invalid credentials or TOTP required
 *       429:
 *         description: Too many login attempts
 */
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await User.findOne({ email })
      .select('+passwordHash +failedLoginAttempts +lockedUntil +mfaSecret +mfaEnabled')
      .lean();

    if (!user) throw new AppError('Invalid email or password', 401);
    if (user.status === 'suspended') throw new AppError('Account suspended', 403);

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      await handleFailedLogin(user);
      return; // handleFailedLogin throws
    }

    await clearFailedLogins(user._id);

    if (user.systemRole === 'super_admin' && user.mfaEnabled) {
      const { totpCode } = loginSchema.parse(req.body);
      if (!totpCode) throw new AppError('TOTP code required', 401);
      const plainSecret = getMfaSecret(user.mfaSecret);
      const valid = verifyMfaToken(plainSecret, totpCode);
      if (!valid) throw new AppError('Invalid TOTP code', 401);
    }

    await User.updateOne(
      { _id: user._id },
      { lastLoginAt: new Date(), lastLoginIp: req.ip },
      { _bypassTenantScope: true }
    );

    // super_admin never gets tenant module access via membership — only via
    // explicit, audited impersonation (see requirePermission.js) — so skip
    // the membership lookup entirely for that role.
    const tenants =
      user.systemRole === 'super_admin' ? [] : await getActiveTenantsForUser(user._id);

    const tokenPayload = {
      sub: user._id.toString(),
      systemRole: user.systemRole ?? undefined,
      ...(tenants.length === 1 && { tenantId: tenants[0]._id }),
    };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    await auditLog({
      actorId: user._id,
      action: 'auth.login',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ accessToken, tenants });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token using httpOnly refresh cookie
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *       401:
 *         description: No or invalid refresh token
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) throw new AppError('No refresh token', 401);
    if (await isTokenBlocked(token)) throw new AppError('Token revoked', 401);

    const payload = verifyRefreshToken(token);
    const accessToken = signAccessToken({
      sub: payload.sub,
      systemRole: payload.systemRole,
      ...(payload.impersonatedTenantId && { impersonatedTenantId: payload.impersonatedTenantId }),
      ...(payload.tenantId && { tenantId: payload.tenantId }),
    });

    res.json({ accessToken });
  } catch {
    next(new AppError('Invalid refresh token', 401));
  }
});

/**
 * @openapi
 * /auth/select-tenant:
 *   post:
 *     summary: Activate one of the caller's tenant memberships on the general-portal login
 *     description: >
 *       For users logging in on the general-portal host (no dedicated subdomain) who
 *       belong to more than one tenant — POST /auth/login returns their active
 *       memberships without picking one. This reissues the access token (and refresh
 *       cookie) with a tenantId claim, which resolveTenant() picks up on any
 *       subsequent request whose Host has no subdomain of its own. Also usable to
 *       switch tenants mid-session.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tenantId]
 *             properties:
 *               tenantId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tenant activated
 *       403:
 *         description: No active membership for this tenant
 */
router.post('/select-tenant', authenticate, async (req, res, next) => {
  try {
    const { tenantId } = selectTenantSchema.parse(req.body);

    const [membership, tenant] = await Promise.all([
      TenantMembership.findOne({ userId: req.user.sub, tenantId, status: 'active' }).lean(),
      Tenant.findOne({ _id: tenantId, status: 'active' }).lean(),
    ]);
    if (!membership || !tenant) {
      throw new AppError('No active membership for this tenant', 403);
    }

    const tokenPayload = { sub: req.user.sub, systemRole: req.user.systemRole, tenantId };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /auth/impersonation-session:
 *   post:
 *     summary: Persist the active impersonation as a refresh cookie on the tenant's own subdomain
 *     description: >
 *       Called by the impersonation callback page right after it lands on the tenant subdomain
 *       with an access token from POST /admin/tenants/:id/impersonate. Without this, the
 *       impersonation claim only lives in memory and a page reload falls back to the ambient
 *       refresh cookie (if any), dropping impersonatedTenantId and reverting to the bare
 *       super_admin view.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Impersonation refresh cookie set
 *       403:
 *         description: No active impersonation session on the current token
 */
router.post('/impersonation-session', authenticate, async (req, res, next) => {
  try {
    if (req.user.systemRole !== 'super_admin' || !req.user.impersonatedTenantId) {
      throw new AppError('No active impersonation session', 403);
    }

    const refreshToken = signRefreshToken({
      sub: req.user.sub,
      systemRole: req.user.systemRole,
      impersonatedTenantId: req.user.impersonatedTenantId,
    });

    res.cookie('refreshToken', refreshToken, {
      ...REFRESH_COOKIE_OPTIONS,
      maxAge: 30 * 60 * 1000,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Revoke tokens and clear refresh cookie
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Not authenticated
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    // Block access token (remaining TTL, assume 15min max)
    await blockToken(req.token, 15 * 60);

    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) await blockToken(refreshToken, 7 * 24 * 60 * 60);

    res.clearCookie('refreshToken', { path: '/' });
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub, 'email systemRole status mfaEnabled').lean();
    if (!user) return next(new AppError('User not found', 404));

    const impersonatedPermissions = effectivePermissionsFor(req.user);
    let permissions = impersonatedPermissions ?? [];
    let tenant = null;
    if (impersonatedPermissions) {
      tenant = await Tenant.findById(req.user.impersonatedTenantId, '_id orgType').lean();
    } else if (user.systemRole !== 'super_admin') {
      const { subdomain, isPortalHost } = getSubdomainInfo(req);
      tenant = !isPortalHost
        ? await Tenant.findOne({ subdomain, status: 'active' }, '_id orgType').lean()
        : await resolveTenantFromToken(req);
      if (tenant) permissions = await resolvePermissions(req.user.sub, tenant._id.toString());
    }

    res.json({
      ...user,
      permissions,
      impersonatedTenantId: req.user.impersonatedTenantId ?? null,
      tenantId: tenant?._id?.toString() ?? req.user.tenantId ?? null,
      orgType: tenant?.orgType ?? null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = forgotSchema.parse(req.body);
    const user = await User.findOne({ email }).lean();

    if (user) {
      const token = generateResetToken();
      await storeResetToken(user._id, token);
      const resetUrl = `https://${env.APP_DOMAIN}/reset-password?token=${token}`;
      await sendPasswordReset(email, resetUrl);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = resetSchema.parse(req.body);

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) throw new AppError('Invalid or expired reset token', 400);

    user.passwordHash = await hashPassword(password);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save({ _bypassTenantScope: true });

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/setup', mfaLimiter, authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub).lean();
    if (!user) throw new AppError('User not found', 404);
    const { secret, otpauthUrl, qrDataUrl } = await generateMfaSecret(user);
    res.json({ secret, otpauthUrl, qrDataUrl });
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/enable', mfaLimiter, authenticate, async (req, res, next) => {
  try {
    const { token, secret } = z.object({ token: z.string(), secret: z.string() }).parse(req.body);
    const valid = verifyMfaToken(secret, token);
    if (!valid) throw new AppError('Invalid TOTP token', 400);
    await enableMfa(req.user.sub, secret);
    res.json({ message: 'MFA enabled' });
  } catch (err) {
    next(err);
  }
});

export default router;
