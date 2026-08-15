import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => logger.error({ err }, 'Redis error'));
redis.on('connect', () => logger.info('Redis connected'));

export async function connectRedis() {
  if (redis.status === 'ready') return;
  await new Promise((resolve, reject) => {
    redis.once('ready', resolve);
    redis.once('error', reject);
  });
}
