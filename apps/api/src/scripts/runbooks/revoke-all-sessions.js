/**
 * Runbook: revoke-all-sessions
 * Usage: node revoke-all-sessions.js --userId=<id>
 *
 * Connects to Redis and sets a blocklist key for the user.
 * All tokens issued before the timestamp stored in this key will be rejected
 * by the authenticate middleware's per-user blocklist check.
 */
import { Redis } from 'ioredis';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);

const { userId } = args;

if (!userId) {
  console.error('Error: --userId is required');
  process.exit(1);
}

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('Error: REDIS_URL environment variable is required');
  process.exit(1);
}

async function run() {
  const redis = new Redis(REDIS_URL, { lazyConnect: true });
  await redis.connect();
  console.log('Connected to Redis');

  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
  const key = `blocklist:user:${userId}`;

  // Store for 7 days (max refresh token lifetime)
  await redis.set(key, timestamp, 'EX', 7 * 24 * 60 * 60);

  console.log(`Success: All sessions for user ${userId} revoked.`);
  console.log(`Key: ${key} = ${timestamp} (tokens issued before this Unix timestamp are now invalid)`);

  await redis.quit();
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
