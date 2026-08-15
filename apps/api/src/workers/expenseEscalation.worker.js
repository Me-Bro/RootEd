import { Worker, Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { ExpenseEntry } from '../models/ExpenseEntry.js';
import { User } from '../models/User.js';
import { sendEmail } from '../services/email.service.js';

const QUEUE_NAME = 'expense-escalation';

let escalationQueue;

function getEscalationQueue() {
  if (!escalationQueue) {
    escalationQueue = new Queue(QUEUE_NAME, { connection: redis });
  }
  return escalationQueue;
}

export async function scheduleEscalation(expenseId, delayMs = 48 * 60 * 60 * 1000) {
  const queue = getEscalationQueue();
  await queue.add(
    'escalate',
    { expenseId: expenseId.toString(), scheduledAt: Date.now() },
    { delay: delayMs, removeOnComplete: 50 }
  );
}

export function startExpenseEscalationWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { expenseId } = job.data;

      const expense = await ExpenseEntry.findById(expenseId).lean();
      if (!expense) return;
      if (expense.status !== 'pending') return;

      const currentStep = expense.approvalChain[expense.currentApproverIndex];
      if (!currentStep) return;

      const user = await User.findById(currentStep.approverId).lean();
      if (!user?.email) return;

      await sendEmail({
        to: user.email,
        subject: 'Action Required: Expense Approval Pending',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2>Expense Approval Required</h2>
            <p>An expense entry (ID: ${expenseId}) requires your approval.</p>
            <p>Please log in to RootEd to review and take action.</p>
          </div>
        `,
      });

      logger.info(
        { expenseId, approverId: currentStep.approverId?.toString() },
        'Escalation email sent'
      );
    },
    { connection: redis, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Expense escalation job failed');
  });

  logger.info('Expense escalation worker started');
  return worker;
}
