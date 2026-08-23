import './config/env.js';
import * as Sentry from '@sentry/node';
import { connectDB } from './config/db.js';
import { connectMonitoringDB } from './config/monitoringDb.js';
import { connectRedis } from './config/redis.js';
import { ensureBucket } from './services/storage.service.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';
import app from './app.js';
import { startAuditWorker } from './workers/audit.worker.js';
import { startReportCardWorker } from './workers/reportCard.worker.js';
import { startExpenseEscalationWorker } from './workers/expenseEscalation.worker.js';
import { startInventoryOverdueWorker } from './workers/inventoryOverdue.worker.js';
import { startTrialExpiryWorker } from './workers/trialExpiry.worker.js';
import { startStockValuationWorker } from './workers/stockValuation.worker.js';
import { startFeeLateChargeWorker } from './workers/feeLateCharge.worker.js';
import { startSalarySlipWorker } from './workers/salarySlip.worker.js';
import { startRequestLogWorker } from './workers/requestLog.worker.js';

async function main() {
  if (env.SENTRY_DSN) {
    Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
  }
  await connectDB();
  await connectMonitoringDB();
  await connectRedis();
  await ensureBucket();
  startAuditWorker();
  startReportCardWorker();
  startExpenseEscalationWorker();
  startInventoryOverdueWorker();
  startTrialExpiryWorker();
  startStockValuationWorker();
  startFeeLateChargeWorker();
  startSalarySlipWorker();
  startRequestLogWorker();

  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'API server started');
  });
}

main().catch((err) => {
  logger.error({ err }, 'Startup failed');
  process.exit(1);
});
