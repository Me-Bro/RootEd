import { resolveWhatsapp } from '@rooted/shared/utils';
import { Visit } from '../models/Visit.js';
import { Seat } from '../models/Seat.js';
import { SeatAllocation } from '../models/SeatAllocation.js';
import { Student } from '../models/Student.js';
import { entitlementsFor } from './entitlement.service.js';
import { resolveCentreSettings } from '../utils/centreSettings.js';
import { dayStringInTz, zonedMidnight, addDaysToDayString } from '../utils/dayKey.js';
import { isWithinOpenHours } from '../utils/openHours.js';
import { fullName } from '../utils/fullName.js';
import { buildActivity, buildSeatTiles, buildSummary, filterLearners } from '../utils/deskView.js';

// The desk lists at most this many learners; search narrows the list on the server, so
// the cap never hides anyone from a search.
export const DESK_LEARNER_LIMIT = 300;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every word of the search must match the name, phone or admission number.
function searchFilter(search) {
  const words = (search ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5);
  return words.map((word) => {
    const re = new RegExp(escapeRegex(word), 'i');
    return { $or: [{ firstName: re }, { lastName: re }, { phone: re }, { admissionNo: re }] };
  });
}

/**
 * Everything the front desk shows, in one read: the strip, the learner list, the live
 * seat tiles and today's activity. `withFees` adds each learner's plan status (it needs
 * `fees:read`, which the caller decides).
 */
export async function loadDesk({
  tenant,
  search,
  filter = 'all',
  withFees = false,
  now = new Date(),
}) {
  const tenantId = tenant._id;
  const centre = resolveCentreSettings(tenant);
  const today = dayStringInTz(now, tenant.timezone);
  const dayStart = zonedMidnight(today, tenant.timezone);
  const dayEnd = zonedMidnight(addDaysToDayString(today, 1), tenant.timezone);

  const [seats, allocations, openVisits, todayVisits] = await Promise.all([
    Seat.find({ tenantId }).lean(),
    SeatAllocation.find({ tenantId, status: 'active' }).lean(),
    Visit.find({ tenantId, isOpen: true }).lean(),
    Visit.find({ tenantId, inAt: { $gte: dayStart, $lt: dayEnd } }).lean(),
  ]);

  const insideIds = openVisits.map((v) => v.studentId);
  const searched = searchFilter(search);
  // Walk-ins are not part of the roster: they show while inside, or when searched for.
  const rosterQuery = {
    tenantId,
    status: 'active',
    ...(searched.length
      ? { $and: searched }
      : { $or: [{ kind: { $ne: 'walk_in' } }, { _id: { $in: insideIds } }] }),
  };
  const roster = await Student.find(
    rosterQuery,
    'firstName lastName phone whatsappNumber whatsappSameAsPhone kind status'
  )
    .sort({ firstName: 1, lastName: 1 })
    .limit(DESK_LEARNER_LIMIT + 1)
    .lean();
  const truncated = roster.length > DESK_LEARNER_LIMIT;
  const rows = roster.slice(0, DESK_LEARNER_LIMIT);

  // Names for everyone shown anywhere on the desk (seat occupants, holders, activity).
  const nameIds = new Set(rows.map((s) => String(s._id)));
  for (const list of [openVisits, todayVisits, allocations]) {
    for (const item of list) nameIds.add(String(item.studentId));
  }
  const missing = [...nameIds].filter((id) => !rows.some((s) => String(s._id) === id));
  const extra = missing.length
    ? await Student.find({ tenantId, _id: { $in: missing } }, 'firstName lastName').lean()
    : [];
  const names = new Map([...rows, ...extra].map((s) => [String(s._id), fullName(s, null)]));

  const entitlements = withFees
    ? await entitlementsFor(
        tenant,
        rows.map((s) => s._id),
        now
      )
    : new Map();

  const tiles = buildSeatTiles({ seats, allocations, openVisits, names });
  const openByStudent = new Map(openVisits.map((v) => [String(v.studentId), v]));
  const tileById = new Map(seats.map((s) => [String(s._id), s]));
  const holdByStudent = new Map();
  [...allocations]
    .sort((a, b) => new Date(a.startDate ?? 0) - new Date(b.startDate ?? 0))
    .forEach((a) => {
      if (!holdByStudent.has(String(a.studentId))) holdByStudent.set(String(a.studentId), a);
    });

  const learners = rows.map((s) => {
    const open = openByStudent.get(String(s._id));
    const hold = holdByStudent.get(String(s._id));
    return {
      _id: s._id,
      name: fullName(s),
      kind: s.kind ?? 'member',
      phone: s.phone ?? null,
      whatsapp: resolveWhatsapp(s) ?? s.phone ?? null,
      inside: open
        ? {
            visitId: open._id,
            inAt: open.inAt,
            seatLabel: tileById.get(String(open.seatId))?.label ?? null,
          }
        : null,
      ownSeat: hold
        ? { seatId: hold.seatId, label: tileById.get(String(hold.seatId))?.label ?? null }
        : null,
      ...(withFees ? { entitlement: entitlements.get(String(s._id)) ?? null } : {}),
    };
  });

  const seatLabels = new Map(seats.map((s) => [String(s._id), s.label]));
  return {
    summary: buildSummary({
      tiles,
      openCount: openVisits.length,
      checkInsToday: todayVisits.length,
      open: isWithinOpenHours(now, centre, tenant.timezone),
      centre,
    }),
    learners: filterLearners(learners, filter),
    truncated,
    seats: tiles,
    activity: buildActivity({ visits: todayVisits, names, seatLabels, now }),
  };
}

/**
 * Just the strip of the desk (inside now, free seats, today's check-ins, open or
 * closed), for the dashboard, which has no use for the learner list.
 */
export async function loadDeskSummary({ tenant, now = new Date() }) {
  const tenantId = tenant._id;
  const centre = resolveCentreSettings(tenant);
  const today = dayStringInTz(now, tenant.timezone);
  const dayStart = zonedMidnight(today, tenant.timezone);
  const dayEnd = zonedMidnight(addDaysToDayString(today, 1), tenant.timezone);

  const [seats, openVisits, checkInsToday] = await Promise.all([
    Seat.find({ tenantId }).lean(),
    Visit.find({ tenantId, isOpen: true }, 'seatId studentId').lean(),
    Visit.countDocuments({ tenantId, inAt: { $gte: dayStart, $lt: dayEnd } }),
  ]);
  const tiles = buildSeatTiles({ seats, allocations: [], openVisits, names: new Map() });
  return buildSummary({
    tiles,
    openCount: openVisits.length,
    checkInsToday,
    open: isWithinOpenHours(now, centre, tenant.timezone),
    centre,
  });
}

/**
 * Closes every open visit at `now` on behalf of an owner. Each visit is closed with
 * its own conditional update, so a learner who checked out a moment earlier is simply
 * skipped. Returns the visits it closed (for the audit trail).
 */
export async function checkOutAll({ tenantId, now = new Date() }) {
  const open = await Visit.find({ tenantId, isOpen: true }, '_id').lean();
  const closed = [];
  for (const { _id } of open) {
    const visit = await Visit.findOneAndUpdate(
      { _id, tenantId, isOpen: true },
      { $set: { outAt: now, bulkClosed: true }, $unset: { isOpen: '' } },
      { new: true }
    );
    if (visit) closed.push(visit);
  }
  return closed;
}
