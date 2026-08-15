import { FeatureFlag } from '../models/FeatureFlag.js';
import { redis } from '../config/redis.js';

const CACHE_TTL = 60;

export async function getFlags() {
  return FeatureFlag.find({}).lean();
}

export async function toggleFlag(key, enabled, actorId, description) {
  const update = { enabled, updatedBy: actorId };
  if (description !== undefined) update.description = description;

  const flag = await FeatureFlag.findOneAndUpdate(
    { key },
    { $set: update },
    { upsert: true, new: true }
  ).lean();

  await redis.del(`flag:${key}`);
  return flag;
}

export async function isEnabled(key) {
  const cached = await redis.get(`flag:${key}`);
  if (cached !== null) return cached === 'true';

  const flag = await FeatureFlag.findOne({ key }).lean();
  const value = flag ? flag.enabled : false;
  await redis.setex(`flag:${key}`, CACHE_TTL, String(value));
  return value;
}
