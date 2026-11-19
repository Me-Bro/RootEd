import { formatCurrency, formatDate, formatTime } from './intl.js';
import { dayText } from './feePlan.js';

// What the History tab says about one entry from GET /academic/students/:id/history.
// The server sends the action and a few plain facts; this turns them into a
// translation key plus ready-to-show values, so the wording lives in the locale files.

export const HISTORY_TYPES = ['profile', 'visit', 'seat', 'fee'];

const BASE = 'studyCenter.studentHistory.actions';

/** The locale key of an action ('student.feePlan.set' -> '...actions.student_feePlan_set'). */
export const actionKey = (action) => `${BASE}.${action.replace(/\./g, '_')}`;

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);

/**
 * `{ key, params }` for `t(key, params)`. An action nobody has written wording for gets
 * a generic line naming it, so a new audit action never shows as a blank row. A few
 * actions have a second wording for when an optional fact is present.
 */
export function historyMessage(entry, labels = {}) {
  const p = entry.params ?? {};
  const base = actionKey(entry.action);
  const time = (iso) => formatTime(iso) || '—';
  switch (entry.action) {
    case 'student.create':
      return { key: base, params: { admissionNo: dash(p.admissionNo) } };
    case 'student.enrolled':
      return { key: base, params: { shift: dash(p.shift) } };
    case 'student.update':
      return {
        key: base,
        params: { fields: (p.fields ?? []).map((f) => labels.field?.(f) ?? f).join(', ') },
      };
    case 'student.status_change':
      return {
        key: p.reason ? `${base}_withReason` : base,
        params: { from: dash(p.from), to: dash(p.to), reason: p.reason },
      };
    case 'student.document_add':
    case 'student.document_download':
      return { key: base, params: { name: dash(p.name) } };
    case 'student.account_created':
      return { key: base, params: { email: dash(p.email) } };
    case 'visit.checkIn':
    case 'visit.outsideHours':
      return { key: base, params: { seat: dash(p.seat) } };
    case 'visit.checkOut':
      return {
        key: p.autoClosed ? `${base}_auto` : p.bulkClosed ? `${base}_bulk` : base,
        params: { seat: dash(p.seat), time: time(p.outAt) },
      };
    case 'seatAllocation.create':
    case 'seatAllocation.end':
      return { key: base, params: { seat: dash(p.seat), shift: dash(p.shift) } };
    case 'seatAllocation.move':
      return { key: base, params: { from: dash(p.from), to: dash(p.to), shift: dash(p.shift) } };
    case 'feePayment.record':
      return {
        key: base,
        params: {
          amount: formatCurrency(p.amount ?? 0),
          method: labels.method?.(p.method) ?? dash(p.method),
          receiptNumber: dash(p.receiptNumber),
        },
      };
    case 'feePayment.refund':
      return { key: base, params: { amount: formatCurrency(p.amount ?? 0) } };
    case 'feeSale.create':
      return { key: base, params: { amount: formatCurrency(p.amount ?? 0) } };
    case 'feeSale.discount':
      return { key: base, params: { name: dash(p.name), amount: formatCurrency(p.amount ?? 0) } };
    case 'feeDiscount.create':
      return { key: base, params: { name: dash(p.name) } };
    case 'student.feePlan.set':
      return {
        key: base,
        params: {
          amount: formatCurrency(p.amount ?? 0),
          cycle: labels.cycle?.(p.cycle) ?? dash(p.cycle),
          from: p.from ? formatDate(p.from) : '—',
        },
      };
    case 'student.feePlan.pause':
    case 'student.feePlan.resume':
    case 'student.feePlan.end':
    case 'student.feePlan.reopen':
      return { key: base, params: { on: p.on ? dayText(p.on) : '—' } };
    case 'student.photo_set':
    case 'student.aadhaar_set':
    case 'student.aadhaar_cleared':
    case 'student.aadhaar_revealed':
    case 'student.claim_resent':
    case 'walkIn.create':
    case 'walkIn.eraseContact':
    case 'feeSale.void':
    case 'feeAssignment.applyDiscount':
    case 'feeAssignment.waive':
    case 'student.feeStructure.add':
    case 'student.feeStructure.remove':
      return { key: base, params: {} };
    default:
      return { key: `${BASE}.unknown`, params: { action: entry.action } };
  }
}

/** The scalar changes of an edit, ready to list as "label: before → after". */
export function editChanges(entry, fieldLabel = (f) => f) {
  return (entry.changes ?? [])
    .filter((c) => !c.complex)
    .map((c) => ({
      field: c.field,
      label: fieldLabel(c.field),
      before: dash(c.before),
      after: dash(c.after),
    }));
}
