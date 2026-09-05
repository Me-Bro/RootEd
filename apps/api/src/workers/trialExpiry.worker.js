import { Worker, Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { Tenant } from '../models/Tenant.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { User } from '../models/User.js';
import { Role } from '../models/Role.js';
import { sendEmail, escapeHtml } from '../services/email.service.js';
import { env, getPortalHost } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Active members holding a tenant:admin role. The previous implementation took
 * TenantMembership.findOne({ tenantId }) — an arbitrary member, with no role
 * and no status filter — so billing mail could go to a teacher, or to somebody
 * whose membership had been suspended.
 */
async function tenantAdminEmails(tenantId) {
  const adminRoles = await Role.find({ tenantId, permissions: 'tenant:admin' }, '_id').lean();
  if (!adminRoles.length) return [];

  const memberships = await TenantMembership.find(
    { tenantId, status: 'active', roleIds: { $in: adminRoles.map((r) => r._id) } },
    'userId'
  ).lean();
  if (!memberships.length) return [];

  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } }, 'email').lean();

  return users.map((u) => u.email).filter((e) => e && !e.endsWith('@deleted.invalid'));
}

const QUEUE_NAME = 'trial-expiry';

export function startTrialExpiryWorker() {
  // Belt and braces with the guard at the call site in index.js: while the
  // product is free there is no trial to expire, and running would mail every
  // tenant about one.
  if (!env.BILLING_ENABLED) {
    logger.info('Trial expiry worker not started — billing is disabled');
    return null;
  }

  const queue = new Queue(QUEUE_NAME, { connection: redis });

  // Register a repeatable cron job — runs daily at 9:00 AM
  queue.add(
    'check-expired-trials',
    {},
    {
      repeat: { pattern: '0 9 * * *' },
      removeOnComplete: true,
      removeOnFail: 100,
    }
  );

  const worker = new Worker(
    QUEUE_NAME,
    async (_job) => {
      const now = new Date();
      const expiredTenants = await Tenant.find({
        isTrialActive: true,
        trialEndsAt: { $lt: now },
      }).lean();

      logger.info({ count: expiredTenants.length }, 'Processing expired trials');

      for (const tenant of expiredTenants) {
        try {
          await Tenant.findByIdAndUpdate(tenant._id, { $set: { isTrialActive: false } });

          const recipients = await tenantAdminEmails(tenant._id);
          const billingUrl = `https://${getPortalHost()}/billing`;
          const safeName = escapeHtml(tenant.name);

          for (const to of recipients) {
            await sendEmail({
              to,
              subject: `Your RootEd trial for ${tenant.name} has ended`,
              html: `
                  <h2>Your 14-day trial has expired</h2>
                  <p>Hi,</p>
                  <p>Your free trial for <strong>${safeName}</strong> on RootEd has ended.</p>
                  <p>To continue using all features, please upgrade your plan.</p>
                  <p><a href="${billingUrl}">Upgrade Now</a></p>
                `,
            });
          }

          logger.info({ tenantId: tenant._id }, 'Trial expired and notification sent');
        } catch (err) {
          logger.error({ err, tenantId: tenant._id }, 'Failed to process trial expiry for tenant');
        }
      }
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Trial expiry job failed');
  });

  logger.info('Trial expiry worker started');
  return worker;
}
