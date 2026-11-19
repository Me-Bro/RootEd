import { Visit } from '../models/Visit.js';
import { Seat } from '../models/Seat.js';
import { User } from '../models/User.js';
import { dayStringInTz, zonedMidnight } from '../utils/dayKey.js';
import { hoursPerLearner, nextMonth } from '../utils/visitReports.js';

const minutesBetween = (from, to) => Math.max(0, Math.round((to - new Date(from)) / 60_000));

const displayName = (u) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || null;

/**
 * One learner's visits for their profile: the open visit (if any), a summary of one
 * month on the centre's calendar (the current month unless `month` is given), and a
 * page of visits, newest first. A visit still open counts up to `now`.
 */
export async function learnerVisits({ tenant, studentId, page, limit, month, now = new Date() }) {
  const tenantId = tenant._id;
  const summaryMonth = month ?? dayStringInTz(now, tenant.timezone).slice(0, 7);
  const from = zonedMidnight(`${summaryMonth}-01`, tenant.timezone);
  const to = zonedMidnight(`${nextMonth(summaryMonth)}-01`, tenant.timezone);

  const [rows, total, open, monthVisits] = await Promise.all([
    Visit.find({ tenantId, studentId })
      .sort({ inAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Visit.countDocuments({ tenantId, studentId }),
    Visit.findOne({ tenantId, studentId, isOpen: true }).lean(),
    Visit.find({ tenantId, studentId, inAt: { $gte: from, $lt: to } }).lean(),
  ]);

  const shown = open ? [...rows, open] : rows;
  const [seats, users] = await Promise.all([
    Seat.find({ tenantId, _id: { $in: shown.map((v) => v.seatId) } }, 'label').lean(),
    User.find(
      { _id: { $in: shown.map((v) => v.recordedBy) } },
      'firstName lastName username'
    ).lean(),
  ]);
  const seatLabels = new Map(seats.map((s) => [String(s._id), s.label]));
  const names = new Map(users.map((u) => [String(u._id), displayName(u)]));

  const toRow = (v) => ({
    _id: String(v._id),
    inAt: v.inAt,
    outAt: v.outAt ?? null,
    open: Boolean(v.isOpen),
    minutes: minutesBetween(v.inAt, v.outAt ? new Date(v.outAt) : now),
    seat: { _id: String(v.seatId), label: seatLabels.get(String(v.seatId)) ?? null },
    method: v.method,
    autoClosed: Boolean(v.autoClosed),
    bulkClosed: Boolean(v.bulkClosed),
    outsideHours: Boolean(v.outsideHours),
    entitlementAtCheckIn: v.entitlementAtCheckIn ?? null,
    recordedBy: { _id: String(v.recordedBy), name: names.get(String(v.recordedBy)) ?? null },
  });

  const [stats] = hoursPerLearner({ visits: monthVisits, from, to, now });
  return {
    open: open ? toRow(open) : null,
    summary: {
      month: summaryMonth,
      visits: stats?.visits ?? 0,
      minutes: stats?.minutes ?? 0,
      autoClosedVisits: stats?.autoClosedVisits ?? 0,
    },
    visits: rows.map(toRow),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}
