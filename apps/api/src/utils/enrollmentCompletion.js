import { COMPLETION_STATUSES } from '@rooted/shared/constants';

/**
 * The Enrollment fields to write for an admin's completion decision.
 *
 * `completed` and `dropped` close the enrolment, so they stamp `endDate` (kept
 * if already set, so re-confirming a decision does not move the date).
 * Reverting to `active` clears it. `notes` is only touched when given.
 */
export function applyCompletion(existing, status, notes, now = new Date()) {
  if (!COMPLETION_STATUSES.includes(status)) {
    throw new Error(`Unknown completion status: ${status}`);
  }

  const update = {
    status,
    endDate: status === 'active' ? null : (existing?.endDate ?? now),
  };
  if (notes !== undefined) update.notes = notes;
  return update;
}
