// Turns raw AuditLog rows into what a learner's History tab may show. Pure: names
// of actors, seats and shifts are looked up by the route and passed in.
//
// The raw before/after never leaves the server. An entry carries a small whitelist of
// readable `params` per action, and for an edit the list of fields that changed.

export const HISTORY_TYPES = ['profile', 'visit', 'seat', 'fee'];

// Disjoint on purpose (profile excludes the fee actions that share its `student.` prefix),
// so the same pattern both classifies an action and filters the query.
const TYPE_PATTERNS = {
  visit: /^visit\./,
  seat: /^seatAllocation\./,
  fee: /^(?:feePayment\.|feeSale\.|feeAssignment\.|feeDiscount\.|student\.fee)/,
  profile: /^(?:student\.(?!fee)|walkIn\.)/,
};

export function historyTypeOf(action) {
  return HISTORY_TYPES.find((t) => TYPE_PATTERNS[t].test(action)) ?? 'other';
}

/** A Mongo filter on `action` for one history type (none for an unknown type). */
export function actionFilterFor(type) {
  const pattern = TYPE_PATTERNS[type];
  return pattern ? { action: { $regex: pattern.source } } : null;
}

const isScalar = (v) =>
  v == null || ['string', 'number', 'boolean'].includes(typeof v) || v instanceof Date;

// A field whose value is a list or object (guardians, address) is reported as changed
// without its contents; the profile shows the current value.
function changesOf(log) {
  const before = log.before ?? {};
  const after = log.after ?? {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields
    .filter((f) => !/^aadhaar/i.test(f))
    .map((field) => {
      const complex = !isScalar(before[field]) || !isScalar(after[field]);
      return complex
        ? { field, complex: true }
        : { field, before: before[field] ?? null, after: after[field] ?? null };
    });
}

const ids = (v) => (v == null ? undefined : String(v));
const seatLabel = (lookups, id) => lookups.seats.get(ids(id)) ?? null;

// The facts worth showing for each action; unknown actions get none.
function paramsOf(log, lookups) {
  const after = log.after ?? {};
  const before = log.before ?? {};
  switch (log.action) {
    case 'student.create':
      return { admissionNo: after.admissionNo ?? null };
    case 'student.enrolled':
      return { shift: lookups.sections.get(ids(after.sectionId)) ?? null };
    case 'student.update':
      return { fields: changesOf(log).map((c) => c.field) };
    case 'student.status_change':
      return { from: before.status ?? null, to: after.status ?? null, reason: after.statusReason };
    case 'student.document_add':
    case 'student.document_download':
      return { name: after.name ?? null, kind: after.kind ?? null };
    case 'student.account_created':
      return { email: after.email ?? null };
    case 'visit.checkIn':
      return {
        seat: seatLabel(lookups, after.seatId),
        entitlement: after.entitlementAtCheckIn ?? null,
      };
    case 'visit.checkOut':
      return {
        seat: seatLabel(lookups, after.seatId),
        inAt: after.inAt ?? null,
        outAt: after.outAt ?? null,
        autoClosed: Boolean(after.autoClosed),
      };
    case 'visit.outsideHours':
      return { seat: seatLabel(lookups, after.seatId) };
    case 'seatAllocation.create':
    case 'seatAllocation.end':
      return {
        seat: seatLabel(lookups, after.seatId ?? before.seatId),
        shift: lookups.sections.get(ids(after.sectionId ?? before.sectionId)) ?? null,
      };
    case 'seatAllocation.move':
      return {
        from: seatLabel(lookups, before.seatId),
        to: seatLabel(lookups, after.seatId),
        shift: lookups.sections.get(ids(after.sectionId ?? before.sectionId)) ?? null,
      };
    case 'feePayment.record':
      return {
        amount: after.amount ?? null,
        method: after.paymentMethod ?? null,
        receiptNumber: after.receiptNumber ?? null,
      };
    case 'feePayment.refund':
      return { amount: after.amount ?? null, reason: after.refundReason };
    case 'feeSale.create':
      return { amount: after.assignment?.totalAmount ?? null };
    case 'feeSale.discount':
      return { name: after.name ?? null, amount: after.amount ?? null };
    case 'feeSale.void':
      return { reason: after.reason };
    case 'feeAssignment.waive':
      return { reason: after.waivedReason };
    case 'feeDiscount.create':
      return { name: after.name ?? null, type: after.type ?? null, value: after.value ?? null };
    case 'student.feePlan.set': {
      const segments = after.billing?.segments ?? [];
      const last = segments[segments.length - 1] ?? {};
      return { cycle: last.cycle ?? null, amount: last.amount ?? null, from: last.from ?? null };
    }
    case 'student.feePlan.pause':
    case 'student.feePlan.resume':
    case 'student.feePlan.end':
    case 'student.feePlan.reopen':
      return { on: after.on ?? null };
    default:
      return {};
  }
}

/**
 * One timeline row. `lookups` holds `actors` (userId -> display name), `seats`
 * (seatId -> label) and `sections` (sectionId -> shift name), each a Map keyed by
 * the id as a string. The IP is included only when the caller may see it.
 */
export function buildHistoryEntry(log, lookups, { includeIp = false } = {}) {
  const actorId = ids(log.actorId);
  const entry = {
    _id: String(log._id),
    at: log.at,
    action: log.action,
    type: historyTypeOf(log.action),
    actor: actorId ? { _id: actorId, name: lookups.actors.get(actorId) ?? null } : null,
    params: paramsOf(log, lookups),
  };
  if (log.action === 'student.update' || log.action === 'student.status_change') {
    entry.changes = changesOf(log);
  }
  if (includeIp) entry.ip = log.ip ?? null;
  return entry;
}

/** The seat and section ids a page of logs refers to, so the route can name them in one query each. */
export function referencedIds(logs) {
  const seatIds = new Set();
  const sectionIds = new Set();
  for (const log of logs) {
    for (const side of [log.before, log.after]) {
      if (side?.seatId) seatIds.add(String(side.seatId));
      if (side?.sectionId) sectionIds.add(String(side.sectionId));
    }
  }
  return { seatIds: [...seatIds], sectionIds: [...sectionIds] };
}
