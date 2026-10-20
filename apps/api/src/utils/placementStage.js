import { nextStageAllowed } from '@rooted/shared/utils';
import { AppError } from '../middleware/errorHandler.js';

// The stage-order rule itself lives in @rooted/shared so the portal offers only
// the moves this file will accept.
export { nextStageAllowed };

const DATE_FIELD = {
  applied: 'appliedAt',
  interviewed: 'interviewedAt',
  offered: 'offeredAt',
  joined: 'joinedAt',
  rejected: 'closedAt',
  withdrawn: 'closedAt',
};

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
