import { Counter } from '../models/Counter.js';
import { Student } from '../models/Student.js';

export async function getNextSequence(tenantId, key) {
  const doc = await Counter.findOneAndUpdate(
    { tenantId, key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
}

const ADMISSION_KEY = 'admission';

// The next plain-number admission number that no student holds. Numbers typed
// by hand (any string) may already occupy the counter's next value, so taken
// ones are skipped. Consumes the counter.
export async function allocateAdmissionNo(tenantId) {
  for (;;) {
    const candidate = String(await getNextSequence(tenantId, ADMISSION_KEY));
    const taken = await Student.exists({ tenantId, admissionNo: candidate });
    if (!taken) return candidate;
  }
}

// What allocateAdmissionNo would hand out now, without consuming it.
export async function peekAdmissionNo(tenantId) {
  const doc = await Counter.findOne({ tenantId, key: ADMISSION_KEY }).lean();
  let seq = (doc?.seq ?? 0) + 1;
  while (await Student.exists({ tenantId, admissionNo: String(seq) })) seq += 1;
  return String(seq);
}
