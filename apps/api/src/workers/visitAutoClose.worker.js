import { Worker, Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { autoCloseVisits } from '../services/visit.service.js';

const QUEUE_NAME = 'visit-auto-close';

/**
 * Closes study-center visits nobody checked out. Every centre has its own closing
 * time, so this is not one cron time: it runs every five minutes and closes whatever
 * is past due for its own tenant (see utils/visitClose.js).
 */
export function startVisitAutoCloseWorker() {
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  queue.add(
    'close-overdue',
    {},
    {
      repeat: { pattern: '*/5 * * * *' },
      removeOnComplete: 10,
      removeOnFail: 50,
    }
  );

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const closed = await autoCloseVisits(new Date());
      if (closed > 0) logger.info({ closed }, 'Auto-closed open visits');
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Visit auto-close job failed');
  });

  logger.info('Visit auto-close worker started');
  return worker;
}
