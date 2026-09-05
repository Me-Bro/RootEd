import { Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import * as emailService from '../services/email.service.js';
import { logger } from '../utils/logger.js';

export const BULK_EMAIL_QUEUE = 'bulk-email';

// Only these may be enqueued. The job names a function rather than carrying a
// rendered body, so a queued job can never be used to post arbitrary HTML into
// somebody's inbox.
const SENDERS = {
  accountClaim: (args) => emailService.sendAccountClaim(...args),
};

export function startBulkEmailWorker() {
  const worker = new Worker(
    BULK_EMAIL_QUEUE,
    async (job) => {
      const send = SENDERS[job.data.kind];
      if (!send) throw new Error(`Unknown bulk email kind: ${job.data.kind}`);
      await send(job.data.args);
    },
    // Deliberately modest: a roster import can enqueue hundreds at once, and
    // the point of the queue is to keep that off the request and away from the
    // provider's rate limit — not to send them as fast as possible.
    { connection: redis, concurrency: 3 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, kind: job?.data?.kind, err }, 'Bulk email job failed');
  });

  logger.info('Bulk email worker started');
  return worker;
}
