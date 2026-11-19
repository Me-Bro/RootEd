import { MAX_BACKDATE_DAYS } from '@rooted/shared/schemas';
import { daysAgoString } from './studyCenter.js';

// Study-center fee plans (monthly / weekly). Pure helpers for the pages; the server
// is the authority on every rule.

// The earliest start date to offer in a date input (how far back the API allows).
export const earliestStartDay = (now = new Date()) => daysAgoString(MAX_BACKDATE_DAYS, now);

// Structures a learner can be put on, split into the ones that bill every cycle and the
// one-off fees. Inactive ones and desk-sold plans (which the day-pass flow owns) are left out.
export function splitFeeStructures(structures) {
  const live = structures.filter((s) => s.isActive !== false && !s.plan?.kind);
  const byName = (a, b) => a.name.localeCompare(b.name);
  return {
    cyclePlans: live.filter((s) => s.cycle).sort(byName),
    oneOffs: live.filter((s) => !s.cycle).sort(byName),
  };
}

// The price of one cycle: the mandatory components added up.
export const cyclePrice = (structure) =>
  (structure.components ?? []).reduce((sum, c) => (c.isOptional ? sum : sum + c.amount), 0);

// A day string ("2027-03-17") as a UTC date, so the calendar day never shifts with
// the browser's timezone.
const utc = (day) => new Date(`${day}T00:00:00Z`);

// "Mar 2027" for a month cycle, "15 Mar" for a week cycle (the page words it as
// "Week of 15 Mar"). `locale` follows the app language.
export function cycleStartText(cycle, start, locale = 'en-IN') {
  const options =
    cycle === 'weekly'
      ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
      : { month: 'short', year: 'numeric', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(locale, options).format(utc(start));
}

// A day string for display ("17 Mar 2027").
export function dayText(day, locale = 'en-IN') {
  if (!day) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utc(day));
}

// How one row of the fee assignments list behaves. A monthly/weekly plan has no stored
// status or fixed total: it is `unpaid` while something is overdue, may be paid ahead
// up to `payableNow`, and takes no waiver or one-off discount. Everything else is as
// it always was.
export function assignmentRow(a) {
  if (!a.ledger) {
    const open = a.status !== 'paid' && a.status !== 'waived';
    return { status: a.status, payable: a.balanceDue ?? 0, canCollect: open, canAdjust: open };
  }
  const { overdue, payableNow } = a.ledger;
  return {
    status: overdue > 0 ? 'unpaid' : 'paid',
    payable: payableNow,
    canCollect: payableNow > 0,
    canAdjust: false,
  };
}

// What the pause/resume controls offer for a plan's state. Pausing needs billing to be
// running; resuming needs it paused. A scheduled, ended or missing plan offers neither.
export function planActions(plan) {
  if (!plan) return { canPause: false, canResume: false };
  return {
    canPause: plan.state === 'active',
    canResume: plan.state === 'paused',
  };
}

// The status buttons on a learner's page. A study-center learner is either active or
// withdrawn (nobody graduates), but one already marked graduated can still come back.
export function statusTransitions(status, seats) {
  const reactivate = { to: 'active', labelKey: 'academic.studentDetail.reactivate' };
  if (status === 'active') {
    return [
      ...(seats ? [] : [{ to: 'graduated', labelKey: 'academic.studentDetail.markGraduated' }]),
      { to: 'withdrawn', labelKey: 'academic.studentDetail.markWithdrawn' },
    ];
  }
  if (status === 'graduated' || status === 'withdrawn') return [reactivate];
  return [];
}
