import { Visit } from '../models/Visit.js';
import { Seat } from '../models/Seat.js';
import { SeatAllocation } from '../models/SeatAllocation.js';
import { Section } from '../models/Section.js';
import { Student } from '../models/Student.js';
import { FeeStructure } from '../models/FeeStructure.js';
import { FeeAssignment } from '../models/FeeAssignment.js';
import { FeePayment } from '../models/FeePayment.js';
import { addDaysToDayString, dayStringInTz, zonedMidnight } from '../utils/dayKey.js';
import { fullName as nameOf } from '../utils/fullName.js';

const fullName = (person) => nameOf(person, '—');
import {
  groupSalesByDay,
  hoursPerLearner,
  nextMonth,
  noShows,
  occupancy,
} from '../utils/visitReports.js';

const monthBounds = (month, timezone) => ({
  from: zonedMidnight(`${month}-01`, timezone),
  to: zonedMidnight(`${nextMonth(month)}-01`, timezone),
});

/** Time on seat per learner for a month on the centre's calendar. */
export async function monthlyHours(tenant, month, now = new Date()) {
  const tenantId = tenant._id;
  const { from, to } = monthBounds(month, tenant.timezone);
  const visits = await Visit.find({ tenantId, inAt: { $gte: from, $lt: to } }).lean();
  const rows = hoursPerLearner({ visits, from, to, now });

  const students = await Student.find(
    { tenantId, _id: { $in: rows.map((r) => r.studentId) } },
    'firstName lastName kind'
  ).lean();
  const byId = new Map(students.map((s) => [String(s._id), s]));
  const learners = rows.map((r) => ({
    ...r,
    name: fullName(byId.get(String(r.studentId))),
    kind: byId.get(String(r.studentId))?.kind ?? 'member',
  }));
  return { month, learners, totalMinutes: learners.reduce((sum, r) => sum + r.minutes, 0) };
}

/** Seats held versus seats occupied right now, overall and per shift. */
export async function currentOccupancy(tenantId) {
  const [seats, allocations, openVisits, sections] = await Promise.all([
    Seat.find({ tenantId }).lean(),
    SeatAllocation.find({ tenantId, status: 'active' }).lean(),
    Visit.find({ tenantId, isOpen: true }, 'seatId studentId').lean(),
    Section.find({ tenantId }, 'name startTime').lean(),
  ]);
  sections.sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'));
  return occupancy({ seats, allocations, openVisits, sections });
}

/** Members with a paid plan covering `date` who never came in. */
export async function noShowsOn(tenant, date) {
  const tenantId = tenant._id;
  const dayStart = zonedMidnight(date, tenant.timezone);
  const dayEnd = new Date(zonedMidnight(addDaysToDayString(date, 1), tenant.timezone) - 1);

  const assignments = await FeeAssignment.find(
    {
      tenantId,
      coversFrom: { $lte: dayEnd },
      coversTo: { $gte: dayStart },
      status: { $in: ['paid', 'waived'] },
    },
    'studentId status coversFrom coversTo'
  ).lean();
  const members = await Student.find(
    {
      tenantId,
      _id: { $in: assignments.map((a) => a.studentId) },
      kind: { $ne: 'walk_in' },
      status: 'active',
    },
    'firstName lastName phone'
  ).lean();
  const visits = await Visit.find(
    {
      tenantId,
      studentId: { $in: members.map((m) => m._id) },
      inAt: { $gte: dayStart, $lte: dayEnd },
    },
    'studentId inAt'
  ).lean();

  const byId = new Map(members.map((m) => [String(m._id), m]));
  const rows = noShows({ members, assignments, visits, dayStart, dayEnd }).map((r) => ({
    ...r,
    name: fullName(byId.get(String(r.studentId))),
    phone: byId.get(String(r.studentId))?.phone ?? null,
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { date, noShows: rows };
}

/** Day pass sales per day (count and money), refunds left out. */
export async function dayPassSales(tenant, { from, to }, now = new Date()) {
  const tenantId = tenant._id;
  const today = dayStringInTz(now, tenant.timezone);
  const end = to ?? today;
  const start = from ?? addDaysToDayString(end, -29);

  const structures = await FeeStructure.find({ tenantId, 'plan.kind': 'day_pass' }, '_id').lean();
  const assignments = await FeeAssignment.find(
    { tenantId, feeStructureId: { $in: structures.map((s) => s._id) } },
    '_id'
  ).lean();
  const payments = await FeePayment.find(
    {
      tenantId,
      assignmentId: { $in: assignments.map((a) => a._id) },
      refunded: { $ne: true },
      paymentDate: {
        $gte: zonedMidnight(start, tenant.timezone),
        $lt: zonedMidnight(addDaysToDayString(end, 1), tenant.timezone),
      },
    },
    'amount paymentDate refunded'
  ).lean();

  const days = groupSalesByDay({ payments, timezone: tenant.timezone });
  return {
    from: start,
    to: end,
    days,
    totalCount: days.reduce((sum, d) => sum + d.count, 0),
    totalRevenue: days.reduce((sum, d) => sum + d.revenue, 0),
  };
}

/** One learner's visits this month, for their own page. */
export async function myMonth(tenant, studentId, now = new Date()) {
  const month = dayStringInTz(now, tenant.timezone).slice(0, 7);
  const { from, to } = monthBounds(month, tenant.timezone);
  const visits = await Visit.find({
    tenantId: tenant._id,
    studentId,
    inAt: { $gte: from, $lt: to },
  }).lean();
  const [row] = hoursPerLearner({ visits, from, to, now });
  return { month, count: row?.visits ?? 0, minutes: row?.minutes ?? 0 };
}
