import { Counter } from '../models/Counter.js';

export async function getNextSequence(tenantId, key) {
  const doc = await Counter.findOneAndUpdate(
    { tenantId, key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
}
