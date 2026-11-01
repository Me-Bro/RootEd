import { addDaysToDayString, dayStringInTz, zonedMidnight } from './dayKey.js';

/**
 * The period a sale lets a learner use the centre, from the plan on its structure.
 * A day pass covers the whole calendar day of `startDate` in the centre's timezone;
 * a shift plan covers `durationDays` calendar days from it. `coversTo` is the last
 * millisecond covered, so a check-in at 23:59 on the last day is still inside.
 */
export function coverageFor({ plan, startDate, timezone }) {
  const startDay = dayStringInTz(startDate, timezone);
  const days = plan.kind === 'day_pass' ? 1 : plan.durationDays;
  const coversFrom = zonedMidnight(startDay, timezone);
  const coversTo = new Date(zonedMidnight(addDaysToDayString(startDay, days), timezone) - 1);
  return { coversFrom, coversTo };
}
