import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { AuditLog } from '../models/AuditLog.js';
import { studentIdFor } from '../utils/auditDiff.js';

let auditQueue;

function getAuditQueue() {
  if (!auditQueue) {
    auditQueue = new Queue('audit', { connection: redis });
  }
  return auditQueue;
}

export async function auditLog(entry) {
  // Every learner-related entry carries the learner, found once here so no
  // caller can forget it.
  const studentId = studentIdFor(entry);
  const data = studentId && !entry.studentId ? { ...entry, studentId } : entry;
  await getAuditQueue().add('write', data, { removeOnComplete: 100 });
}

export async function processAuditLog(entry) {
  await AuditLog.create(entry);
}
