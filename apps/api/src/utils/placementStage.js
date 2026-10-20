import { AppError } from '../middleware/errorHandler.js';

// The progression, in order. rejected/withdrawn close an application without a
// joining; every stage from `joined` on is terminal.
const PROGRESSION = ['applied', 'interviewed', 'offered', 'joined'];
const CLOSING = ['rejected', 'withdrawn'];

const DATE_FIELD = {
  applied: 'appliedAt',
  interviewed: 'interviewedAt',
  offered: 'offeredAt',
  joined: 'joinedAt',
  rejected: 'closedAt',
  withdrawn: 'closedAt',
};

/**
 * A stage may only move forward, skipping steps is fine (an offer can follow a
 * walk-in), and an application that has joined, been rejected or been
 * withdrawn is finished.
 */
export function nextStageAllowed(current, next) {
  const from = PROGRESSION.indexOf(current);
  if (from === -1) return false; // unknown, or already closed
  if (current === 'joined') return false;
  if (CLOSING.includes(next)) return true;
  const to = PROGRESSION.indexOf(next);
  return to > from;
}

const latestDate = (application) =>
  Object.values(DATE_FIELD)
    .map((field) => application[field])
    .filter(Boolean)
    .reduce((max, d) => (d > max ? d : max), new Date(0));

/**
 * The fields to write when moving an application to `next`. Pure: the caller
 * supplies the application and the clock.
 *
 * Only the date for the stage reached is set — a skipped stage keeps no date,
 * so the interviewed and offered counts stay honest.
 */
export function buildStageMove(application, next, at = new Date()) {
  if (!nextStageAllowed(application.stage, next)) {
    throw new AppError(`Cannot move an application from ${application.stage} to ${next}`, 400);
  }
  if (at < latestDate(application)) {
    throw new AppError('The date is before an earlier stage of this application', 400);
  }
  return { stage: next, [DATE_FIELD[next]]: at };
}
