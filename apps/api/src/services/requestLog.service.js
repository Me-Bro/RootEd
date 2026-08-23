import { Queue } from 'bullmq';
import { redis } from '../config/redis.js';
import { RequestLog } from '../models/RequestLog.js';
import { User } from '../models/User.js';

let requestLogQueue;

function getRequestLogQueue() {
  if (!requestLogQueue) {
    requestLogQueue = new Queue('request-log', { connection: redis });
  }
  return requestLogQueue;
}

// "Log everything" volume is much higher than the audit queue's (mutations only),
// so completed/failed jobs are trimmed aggressively to keep Redis bounded.
export async function enqueueRequestLog(entry) {
  await getRequestLogQueue().add('write', entry, {
    removeOnComplete: true,
    removeOnFail: 1000,
  });
}

// The access token payload only carries the user's id (`sub`), not their email, so
// it's resolved here in the async worker path rather than adding a lookup to every
// request's hot path.
export async function processRequestLog(entry) {
  let userEmail;
  if (entry.userId) {
    const user = await User.findById(entry.userId).select('email').lean();
    userEmail = user?.email;
  }
  await RequestLog.create({ ...entry, userEmail });
}

const MODULE_PREFIXES = new Set([
  'auth',
  'admin',
  'tenant',
  'academic',
  'staff',
  'expense',
  'fee',
  'inventory',
  'billing',
]);

// Router mount prefixes in app.js are 1:1 with module names, so the first path
// segment is the module — no lookup table to keep in sync.
export function deriveModule(path) {
  const [, segment] = path.split('/');
  return MODULE_PREFIXES.has(segment) ? segment : undefined;
}
