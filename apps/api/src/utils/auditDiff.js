// Pure helpers for audit entries that record what a mutation changed.

export const REDACTED = '[redacted]';

function isObjectIdLike(v) {
  return v != null && typeof v === 'object' && v._bsontype === 'ObjectId';
}

/** Structural equality for the values a document holds; null and undefined are the same. */
function same(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (isObjectIdLike(a) || isObjectIdLike(b)) return String(a) === String(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => same(v, b[i]))
    );
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!same(a[k], b[k])) return false;
    return true;
  }
  return a === b;
}

/** A copy of `obj` with the listed top-level keys masked; keys that are absent stay absent. */
export function redactFields(obj, redact = []) {
  if (!obj) return obj;
  const out = { ...obj };
  for (const key of redact) if (out[key] != null) out[key] = REDACTED;
  return out;
}

/**
 * The top-level fields that differ between two snapshots, as `{ before, after }`
 * holding only those fields, or `null` when nothing changed (so a caller can
 * skip the audit entry). A field in `redact` is still reported as changed but
 * its value is masked on both sides, so a secret never reaches the audit log.
 */
export function changedFields(before, after, { redact = [] } = {}) {
  const b = before ?? {};
  const a = after ?? {};
  const outBefore = {};
  const outAfter = {};
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (same(b[key], a[key])) continue;
    outBefore[key] = b[key];
    outAfter[key] = a[key];
  }
  if (Object.keys(outAfter).length === 0 && Object.keys(outBefore).length === 0) return null;
  return {
    before: redactFields(outBefore, redact),
    after: redactFields(outAfter, redact),
  };
}

/**
 * The learner an audit entry concerns, so a profile's history can find it: an
 * explicit `studentId` wins, then a Student target, then the `studentId` the
 * before/after snapshot carries (fee assignments, payments, seats, visits, and
 * a sale's `{ assignment }`). Undefined when the entry is about no learner.
 */
export function studentIdFor(entry) {
  if (entry.studentId) return entry.studentId;
  if (entry.target?.model === 'Student') return entry.target.id;
  return (
    entry.after?.studentId ??
    entry.before?.studentId ??
    entry.after?.assignment?.studentId ??
    undefined
  );
}
