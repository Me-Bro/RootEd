import { Worker, Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { Tenant } from '../models/Tenant.js';
import { TenantMembership } from '../models/TenantMembership.js';
import { User } from '../models/User.js';
import { sendEmail } from '../services/email.service.js';
import { logger } from '../utils/logger.js';

const QUEUE_NAME = 'trial-expiry';

export function startTrialExpiryWorker() {
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

          // Find tenant admin to email
          const membership = await TenantMembership.findOne({ tenantId: tenant._id }).lean();
          if (membership) {
            const user = await User.findById(membership.userId).lean();
            if (user?.email && !user.email.endsWith('@deleted.invalid')) {
              await sendEmail({
                to: user.email,
                subject: `Your EduFlow trial for ${tenant.name} has ended`,
                html: `
                  <h2>Your 14-day trial has expired</h2>
                  <p>Hi,</p>
                  <p>Your free trial for <strong>${tenant.name}</strong> on EduFlow has ended.</p>
                  <p>To continue using all features, please upgrade your plan.</p>
                  <p><a href="https://app.eduflow.app/billing">Upgrade Now</a></p>
                `,
              });
            }
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
