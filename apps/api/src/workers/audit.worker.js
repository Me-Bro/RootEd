import { Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { processAuditLog } from '../services/audit.service.js';
import { logger } from '../utils/logger.js';

export function startAuditWorker() {
  const worker = new Worker(
    'audit',
    async (job) => {
      await processAuditLog(job.data);
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Audit job failed');
  });

  logger.info('Audit worker started');
  return worker;
}
