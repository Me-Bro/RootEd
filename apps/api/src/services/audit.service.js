import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { AuditLog } from '../models/AuditLog.js';

let auditQueue;

function getAuditQueue() {
  if (!auditQueue) {
    auditQueue = new Queue('audit', { connection: redis });
  }
  return auditQueue;
}

export async function auditLog(entry) {
  await getAuditQueue().add('write', entry, { removeOnComplete: 100 });
}

export async function processAuditLog(entry) {
  await AuditLog.create(entry);
}
