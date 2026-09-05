import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createOrganizationSchema } from '@rooted/shared/schemas';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { User } from '../models/User.js';
import { createOrganization, MAX_ORGS_PER_FOUNDER } from '../services/tenant.service.js';
import { issueTenantSession } from '../utils/session.js';
import { auditLog } from '../services/audit.service.js';
import { env } from '../config/env.js';

const router = Router();

// Creating an organization is cheap for us and valuable to an abuser, so it is
// limited per IP as well as by the per-founder cap enforced in the service.
const createOrgLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 5 : 500,
  message: { error: 'Too many organizations created, try again later' },
});

/**
 * @openapi
 * /orgs:
 *   post:
 *     summary: Create an organization, with the caller as its administrator
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Created; returns a session scoped to the new organization
 *       403:
 *         description: Email not verified, or caller is a super_admin
 *       409:
 *         description: Per-founder organization limit reached
 */
router.post(
  '/',
  createOrgLimiter,
  authenticate,
  validate(createOrganizationSchema),
  async (req, res, next) => {
    try {
      // A super_admin who founded an organization could not enter it:
      // POST /auth/login skips the membership lookup for that role, and
      // requirePermission() grants them nothing without an explicit
      // impersonation claim. Refuse rather than leave that dead end.
      if (req.user.systemRole === 'super_admin') {
        throw new AppError('Super admins provision organizations through POST /admin/tenants', 403);
      }

      const founder = await User.findById(req.user.sub, 'email emailVerified').lean();
      if (!founder) throw new AppError('User not found', 404);
      if (!founder.emailVerified) {
        throw new AppError('Verify your email address before creating an organization', 403);
      }

      const tenant = await createOrganization({ ...req.body, founder });

      await auditLog({
        actorId: founder._id,
        tenantId: tenant._id.toString(),
        action: 'org.created',
        target: { model: 'Tenant', id: tenant._id },
        after: { name: tenant.name, orgType: tenant.orgType },
        ip: req.ip,
      });

      // Hand back a session already scoped to the new organization, so the
      // client lands inside it rather than on the tenant picker.
      const accessToken = issueTenantSession(res, {
        sub: req.user.sub,
        systemRole: req.user.systemRole,
        tenantId: tenant._id,
      });

      res.status(201).json({
        _id: tenant._id.toString(),
        name: tenant.name,
        orgType: tenant.orgType,
        plan: tenant.plan,
        accessToken,
        orgLimit: MAX_ORGS_PER_FOUNDER,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
