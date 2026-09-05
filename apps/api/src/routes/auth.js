import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  updateProfileSchema,
  changeEmailSchema,
  confirmEmailChangeSchema,
  changePasswordSchema,
  usernameSchema,
  acceptInviteSchema,
  submitJoinRequestSchema,
} from '@rooted/shared/schemas';
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
  generateToken,
  storeResetToken,
  hashToken,
  revokeUserSessions,
  getActiveTenantsForUser,
} from '../services/auth.service.js';
import {
  loginFilterFor,
  isUsernameAvailable,
  applyUsernameChange,
  issueEmailVerification,
  issueEmailChange,
} from '../services/identity.service.js';
import { validate } from '../middleware/validate.js';
import { REFRESH_COOKIE_OPTIONS, issueTenantSession } from '../utils/session.js';
import { AppError } from '../middleware/errorHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { resolvePermissions, effectivePermissionsFor } from '../middleware/requirePermission.js';
import { resolveTenantFromToken, getSubdomainInfo } from '../middleware/resolveTenant.js';
import { Tenant } from '../models/Tenant.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { env, getPortalHost } from '../config/env.js';
import { auditLog } from '../services/audit.service.js';
import {
  generateMfaSecret,
  verifyMfaToken,
  enableMfa,
  getMfaSecret,
} from '../services/mfa.service.js';
import {
  sendPasswordReset,
  sendEmailVerification,
  sendEmailChangeConfirmation,
  sendEmailChangeNotice,
  sendAccountExistsNotice,
} from '../services/email.service.js';
import { acceptInvite } from '../services/invite.service.js';
import { tenantForJoinCode, submitJoinRequest } from '../services/joinRequest.service.js';
import { broadcastToRole } from '../services/notification.service.js';

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

// Request schemas live in @rooted/shared/schemas so the API and the web forms
// validate against one definition — these used to be duplicated here.
const selectTenantSchema = z.object({ tenantId: z.string() });

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 5 : 500,
  message: { error: 'Too many registration attempts' },
});

const verificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 5 : 500,
  message: { error: 'Too many requests, try again later' },
});

// Availability lookups are unauthenticated by necessity (they run while the
// registration form is being filled in), so they are the cheapest username
// enumeration oracle on the service. Rate limit accordingly.
const usernameLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 60 : 1000,
  message: { error: 'Too many lookups' },
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
    // `email` is still accepted so existing clients keep working; the field was
    // renamed to `identifier` when username login landed.
    const body = { ...req.body, identifier: req.body.identifier ?? req.body.email };
    const { identifier, password } = loginSchema.parse(body);

    const user = await User.findOne(loginFilterFor(identifier))
      .select('+passwordHash +failedLoginAttempts +lockedUntil +mfaSecret +mfaEnabled')
      .lean();

    if (!user) throw new AppError('Invalid credentials', 401);
    if (user.status === 'suspended') throw new AppError('Account suspended', 403);
    if (user.status === 'pending_verification') {
      throw new AppError('Verify your email address before signing in', 403);
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      await handleFailedLogin(user);
      return; // handleFailedLogin throws
    }

    await clearFailedLogins(user._id);

    if (user.systemRole === 'super_admin' && user.mfaEnabled) {
      const { totpCode } = loginSchema.parse(body);
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

    const accessToken = issueTenantSession(res, {
      sub: req.user.sub,
      systemRole: req.user.systemRole,
      tenantId,
    });

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
    const user = await User.findById(
      req.user.sub,
      'email emailVerified pendingEmail username firstName lastName phone systemRole status mfaEnabled'
    ).lean();
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

    // Mirrors the tenants[] that POST /auth/login returns. Without it the org
    // list is lost on reload, since a reload only runs /auth/refresh + /auth/me
    // — which is what stranded the tenant picker on /login. super_admin is
    // excluded for the same reason as in POST /auth/login: tenant access comes
    // from impersonation, never from membership.
    const orgs =
      user.systemRole === 'super_admin' ? [] : await getActiveTenantsForUser(req.user.sub);

    res.json({
      ...user,
      permissions,
      orgs,
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
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await User.findOne({ email }).lean();

    if (user) {
      const token = generateToken();
      await storeResetToken(user._id, token);
      // getPortalHost(), not APP_DOMAIN: when PORTAL_SUBDOMAIN is set (as it is
      // on the tunnel deployment) the app is served from that label, and the
      // bare apex doesn't route — the reset link would go nowhere.
      const resetUrl = `https://${getPortalHost()}/reset-password?token=${token}`;
      await sendPasswordReset(email, resetUrl);
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = resetPasswordSchema.parse(req.body);

    const user = await User.findOne({
      passwordResetToken: hashToken(token),
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) throw new AppError('Invalid or expired reset token', 400);

    user.passwordHash = await hashPassword(password);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    // The same endpoint backs invite acceptance and roster claim. Both start as
    // an account holding a random password nobody was told; setting their own
    // is what activates it.
    if (user.status === 'invited' || user.status === 'pending_claim') user.status = 'active';
    // Redeeming a token that was mailed to this address is proof of control of
    // it, so a claimed or reset account does not also have to chase a separate
    // verification email.
    if (!user.emailVerified) user.emailVerified = true;
    await user.save({ _bypassTenantScope: true });

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
});

// Mounted here, before resolveTenant(), because acceptance happens on the
// portal host — the token is what identifies the tenant, so the invitee never
// needs to know the subdomain.
router.post(
  '/invites/accept',
  authenticate,
  validate(acceptInviteSchema),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user.sub, 'email emailVerified status').lean();
      if (!user) throw new AppError('User not found', 404);

      const { tenantId, alreadyAccepted } = await acceptInvite({ token: req.body.token, user });

      // Hand back a session already scoped to the organization just joined, so
      // the client lands inside it instead of on the tenant picker.
      const accessToken = issueTenantSession(res, {
        sub: req.user.sub,
        systemRole: req.user.systemRole,
        tenantId,
      });

      await auditLog({
        actorId: req.user.sub,
        tenantId: tenantId.toString(),
        action: 'invite.accepted',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({
        tenantId: tenantId.toString(),
        alreadyAccepted,
        accessToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

// Join codes are the cheapest thing on the service to guess at, so they are
// limited twice: per IP, to slow a scanner, and per account, so a scanner
// cannot simply rotate through addresses from one machine.
const joinRequestIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 20 : 1000,
  message: { error: 'Too many attempts, try again later' },
});

const joinRequestUserLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 10 : 1000,
  keyGenerator: (req) => `join:${req.user.sub}`,
  message: { error: 'Too many attempts, try again later' },
});

// Portal-mounted, like invite acceptance: the code identifies the tenant, so
// the applicant never needs to know the subdomain.
router.post(
  '/join-requests',
  joinRequestIpLimiter,
  authenticate,
  joinRequestUserLimiter,
  validate(submitJoinRequestSchema),
  async (req, res, next) => {
    try {
      const user = await User.findById(
        req.user.sub,
        'email emailVerified firstName lastName'
      ).lean();
      if (!user) throw new AppError('User not found', 404);
      // Otherwise an unverified address is enough to put a stranger's name in
      // front of an administrator, and to occupy a membership row.
      if (!user.emailVerified) {
        throw new AppError('Verify your email address before joining an organization', 403);
      }

      const tenant = await tenantForJoinCode(req.body.joinCode);
      const { membership, autoApproved } = await submitJoinRequest({
        tenant,
        user,
        note: req.body.note,
      });

      if (!autoApproved) {
        const who = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
        await broadcastToRole(
          tenant._id,
          'tenant_admin',
          'New request to join',
          `${who} has asked to join ${tenant.name}.`,
          '/tenant/members'
        );
      }

      await auditLog({
        actorId: user._id,
        tenantId: tenant._id.toString(),
        action: autoApproved ? 'join_request.auto_approved' : 'join_request.submitted',
        target: { model: 'TenantMembership', id: membership._id },
        ip: req.ip,
      });

      // Auto-approved applicants are members already, so hand them a session
      // scoped to the organization rather than making them pick it again.
      let accessToken;
      if (autoApproved) {
        accessToken = issueTenantSession(res, {
          sub: req.user.sub,
          systemRole: req.user.systemRole,
          tenantId: tenant._id,
        });
      }

      res.status(autoApproved ? 200 : 202).json({
        status: membership.status,
        tenantId: tenant._id.toString(),
        tenantName: tenant.name,
        ...(accessToken ? { accessToken } : {}),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── Registration & email verification ────────────────────────────────────────

router.post('/register', registerLimiter, validate(registerSchema), async (req, res, next) => {
  try {
    const { email, username, password, firstName, lastName } = req.body;
    const portalHost = getPortalHost();
    // Deliberately identical whether or not the address is already registered.
    const accepted = { message: 'Check your email to continue.' };

    const existing = await User.findOne({ email }, '_id').lean();
    if (existing) {
      await sendAccountExistsNotice(
        email,
        `https://${portalHost}/login`,
        `https://${portalHost}/forgot-password`
      );
      return res.status(202).json(accepted);
    }

    if (!(await isUsernameAvailable(username))) {
      throw new AppError('That username is taken', 409);
    }

    let user;
    try {
      user = await User.create({
        email,
        username,
        usernameLower: username,
        firstName,
        lastName,
        passwordHash: await hashPassword(password),
        status: 'pending_verification',
        emailVerified: false,
      });
    } catch (err) {
      // The availability check above is not atomic; the unique indexes are.
      if (err.code === 11000) {
        const field = Object.keys(err.keyPattern ?? {})[0];
        if (field === 'usernameLower') throw new AppError('That username is taken', 409);
        return res.status(202).json(accepted);
      }
      throw err;
    }

    const token = await issueEmailVerification(user._id);
    await sendEmailVerification(email, `https://${portalHost}/verify-email?token=${token}`);

    await auditLog({
      actorId: user._id,
      action: 'auth.register',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(202).json(accepted);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/verify-email',
  verificationLimiter,
  validate(verifyEmailSchema),
  async (req, res, next) => {
    try {
      const user = await User.findOne({
        emailVerificationToken: hashToken(req.body.token),
        emailVerificationExpires: { $gt: new Date() },
      }).select('+emailVerificationToken +emailVerificationExpires');

      if (!user) throw new AppError('Invalid or expired verification link', 400);

      user.emailVerified = true;
      if (user.status === 'pending_verification') user.status = 'active';
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save({ _bypassTenantScope: true });

      res.json({ message: 'Email verified' });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/resend-verification',
  verificationLimiter,
  validate(resendVerificationSchema),
  async (req, res, next) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email }, '_id emailVerified').lean();

      if (user && !user.emailVerified) {
        const token = await issueEmailVerification(user._id);
        await sendEmailVerification(
          email,
          `https://${getPortalHost()}/verify-email?token=${token}`
        );
      }

      // Same answer regardless, for the same reason as /auth/forgot-password.
      res.json({ message: 'If that address needs verifying, a new link has been sent.' });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/username-available', usernameLookupLimiter, async (req, res, next) => {
  try {
    const parsed = usernameSchema.safeParse(req.query.username ?? '');
    if (!parsed.success) {
      return res.json({ available: false, reason: parsed.error.issues[0]?.message ?? 'invalid' });
    }
    res.json({ available: await isUsernameAvailable(parsed.data), username: parsed.data });
  } catch (err) {
    next(err);
  }
});

// ── Account settings ─────────────────────────────────────────────────────────

router.patch('/me', authenticate, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) throw new AppError('User not found', 404);

    const { firstName, lastName, phone, username } = req.body;
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    // Enforces the change cooldown and parks the old handle.
    if (username !== undefined) await applyUsernameChange(user, username);

    await user.save({ _bypassTenantScope: true });

    res.json({
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/change-email', authenticate, validate(changeEmailSchema), async (req, res, next) => {
  try {
    const { newEmail, currentPassword } = req.body;

    const user = await User.findById(req.user.sub).select('+passwordHash');
    if (!user) throw new AppError('User not found', 404);
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new AppError('Incorrect password', 401);
    }
    if (newEmail === user.email) throw new AppError('That is already your email address', 400);

    // Unlike /register, this reports the conflict outright: the caller is
    // already authenticated and has just re-entered their password, so it is a
    // poor enumeration oracle and silence here would only confuse them.
    const taken = await User.findOne({ email: newEmail }, '_id').lean();
    if (taken) throw new AppError('That email address is not available', 409);

    const token = await issueEmailChange(user._id, newEmail);
    const confirmUrl = `https://${getPortalHost()}/confirm-email?token=${token}`;
    await Promise.all([
      sendEmailChangeConfirmation(newEmail, confirmUrl),
      // The old address is told too, so a stolen session cannot move the
      // account somewhere the real owner never sees.
      sendEmailChangeNotice(user.email, newEmail),
    ]);

    await auditLog({
      actorId: user._id,
      action: 'auth.email_change_requested',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Confirm the change from your new email address.' });
  } catch (err) {
    next(err);
  }
});

router.post('/confirm-email', validate(confirmEmailChangeSchema), async (req, res, next) => {
  try {
    const user = await User.findOne({
      pendingEmailToken: hashToken(req.body.token),
      pendingEmailExpires: { $gt: new Date() },
    }).select('+pendingEmailToken +pendingEmailExpires');

    if (!user?.pendingEmail) throw new AppError('Invalid or expired link', 400);

    const taken = await User.findOne(
      { email: user.pendingEmail, _id: { $ne: user._id } },
      '_id'
    ).lean();
    if (taken) throw new AppError('That email address is no longer available', 409);

    user.email = user.pendingEmail;
    user.emailVerified = true;
    user.pendingEmail = undefined;
    user.pendingEmailToken = undefined;
    user.pendingEmailExpires = undefined;
    await user.save({ _bypassTenantScope: true });

    // The address a session authenticates as has changed — drop every session.
    await revokeUserSessions(user._id);

    await auditLog({
      actorId: user._id,
      action: 'auth.email_changed',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Email updated. Sign in again.' });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(req.user.sub).select('+passwordHash');
      if (!user) throw new AppError('User not found', 404);
      if (!(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new AppError('Incorrect password', 401);
      }
      if (currentPassword === newPassword) {
        throw new AppError('Choose a password you have not used here before', 400);
      }

      user.passwordHash = await hashPassword(newPassword);
      await user.save({ _bypassTenantScope: true });

      // Includes the caller's own session: a password change is how someone
      // evicts an intruder, so it has to invalidate every token, not all but one.
      await revokeUserSessions(user._id);
      res.clearCookie('refreshToken', { path: '/' });

      await auditLog({
        actorId: user._id,
        action: 'auth.password_changed',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.json({ message: 'Password updated. Sign in again.' });
    } catch (err) {
      next(err);
    }
  }
);

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
