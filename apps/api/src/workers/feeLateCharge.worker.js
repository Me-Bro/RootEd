import { Worker, Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeeStructure } from '../models/FeeStructure.js';
import { calculateLateFeeAmount } from '../utils/feeCalculations.js';

const QUEUE_NAME = 'fee-late-charge';

let lateChargeQueue;

function getLateChargeQueue() {
  if (!lateChargeQueue) {
    lateChargeQueue = new Queue(QUEUE_NAME, { connection: redis });
  }
  return lateChargeQueue;
}

export async function scheduleLateCharge(assignmentId, delayMs) {
  const queue = getLateChargeQueue();
  await queue.add(
    'apply',
    { assignmentId: assignmentId.toString(), scheduledAt: Date.now() },
    { delay: Math.max(0, delayMs), removeOnComplete: 50 }
  );
}

export function startFeeLateChargeWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { assignmentId } = job.data;

      const assignment = await FeeAssignment.findById(assignmentId);
      if (!assignment) return;
      if (assignment.status === 'paid' || assignment.status === 'waived') return;
      if (assignment.lateFeeAmount > 0) return;

      const structure = await FeeStructure.findById(assignment.feeStructureId).lean();
      if (!structure?.lateFeeEnabled) return;

      assignment.lateFeeAmount = calculateLateFeeAmount({
        type: structure.lateFeeType,
        value: structure.lateFeeValue,
        baseAmount: assignment.totalAmount,
      });
      await assignment.save();

      logger.info({ assignmentId, lateFeeAmount: assignment.lateFeeAmount }, 'Late fee applied');
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Fee late charge job failed');
  });

  logger.info('Fee late charge worker started');
  return worker;
}
