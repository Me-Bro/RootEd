import { redis } from '../config/redis.js';

/**
 * Fetch a value from Redis cache, or call fetchFn and cache the result.
 * @param {string} key - Cache key
 * @param {number} ttlSeconds - TTL in seconds
 * @param {() => Promise<unknown>} fetchFn - Async function to fetch fresh data
 * @returns {Promise<unknown>}
 */
export async function withCache(key, ttlSeconds, fetchFn) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const result = await fetchFn();
  if (result !== null && result !== undefined) {
    await redis.setex(key, ttlSeconds, JSON.stringify(result));
  }
  return result;
}

/**
 * Invalidate one or more cache keys.
 * @param {...string} keys
 */
export async function invalidateCache(...keys) {
  if (keys.length > 0) await redis.del(...keys);
}
