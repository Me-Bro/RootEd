import { Worker, Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { StockMovement } from '../models/StockMovement.js';
import { InventoryItem } from '../models/InventoryItem.js';
import { User } from '../models/User.js';
import { sendEmail } from '../services/email.service.js';
import { auditLog } from '../services/audit.service.js';

const QUEUE_NAME = 'inventory-overdue';

export function startInventoryOverdueWorker() {
  const queue = new Queue(QUEUE_NAME, { connection: redis });

  queue.add(
    'check-overdue',
    {},
    {
      repeat: { cron: '0 8 * * *' },
      removeOnComplete: 10,
    }
  );

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const today = new Date();

      const overdueMovements = await StockMovement.find({
        movementType: 'issue',
        dueDate: { $lt: today },
        returnedAt: null,
      }, null, { _bypassTenantScope: true }).populate('itemId').lean();

      for (const movement of overdueMovements) {
        const item = movement.itemId;
        if (!item) continue;

        const custodianId = item.custodianId;
        if (custodianId) {
          const custodian = await User.findById(custodianId).lean();
          if (custodian?.email) {
            await sendEmail({
              to: custodian.email,
              subject: 'Overdue Inventory Item Return',
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                  <h2>Overdue Item Return</h2>
                  <p>Item <strong>${item.name}</strong> (SKU: ${item.sku}) was due for return on ${movement.dueDate?.toLocaleDateString() ?? 'N/A'}.</p>
                  <p>Please ensure the item is returned immediately.</p>
                </div>
              `,
            });
          }
        }

        await auditLog({
          actorId: 'system',
          tenantId: movement.tenantId?.toString(),
          action: 'inventory.overdue',
          target: { type: 'StockMovement', id: movement._id.toString() },
          after: { itemId: item._id?.toString(), dueDate: movement.dueDate },
        });
      }

      logger.info({ count: overdueMovements.length }, 'Inventory overdue check complete');
    },
    { connection: redis, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Inventory overdue job failed');
  });

  logger.info('Inventory overdue worker started');
  return worker;
}
