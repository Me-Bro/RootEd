import { Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { processRequestLog } from '../services/requestLog.service.js';
import { logger } from '../utils/logger.js';

export function startRequestLogWorker() {
  const worker = new Worker(
    'request-log',
    async (job) => {
      await processRequestLog(job.data);
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Request-log job failed');
  });

  logger.info('Request-log worker started');
  return worker;
}
