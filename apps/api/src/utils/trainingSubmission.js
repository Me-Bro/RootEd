import { AppError } from '../middleware/errorHandler.js';

/**
 * The fields to write for one student's result on an assignment.
 *
 * Pure: the route supplies the assignment, any existing row and the clock, so
 * every rule here is testable without a database.
 *
 * - Only a `reviewed` record carries a score, reviewer and review time; moving
 *   back to `submitted` or `pending` clears them so a stale score never shows.
 * - `submittedAt` is stamped once and kept across edits; a record that goes
 *   straight to `reviewed` is treated as submitted at that moment.
 */
export function buildSubmissionUpdate({ assignment, existing, input, actorId, now = new Date() }) {
  const { status, score, feedback } = input;

  if (status === 'reviewed' && score > assignment.maxScore) {
    throw new AppError(`Score exceeds the assignment maximum of ${assignment.maxScore}`, 400);
  }

  const reviewed = status === 'reviewed';
  return {
    status,
    score: reviewed ? score : null,
    feedback: feedback !== undefined ? feedback : (existing?.feedback ?? null),
    submittedAt: status === 'pending' ? null : (existing?.submittedAt ?? now),
    reviewedAt: reviewed ? now : null,
    reviewedBy: reviewed ? actorId : null,
  };
}
