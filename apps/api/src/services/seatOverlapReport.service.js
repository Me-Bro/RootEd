import { SeatAllocation } from '../models/SeatAllocation.js';
import { Section } from '../models/Section.js';
import { Seat } from '../models/Seat.js';
import { Student } from '../models/Student.js';
import { Tenant } from '../models/Tenant.js';
import { findOverlappingHolds } from '../utils/seatOverlaps.js';
import { fullName } from '../utils/fullName.js';

// Reads across tenants, so every tenant-scoped query opts out of the scope plugin.
const ACROSS_TENANTS = { _bypassTenantScope: true };

/**
 * Seats that are held in two shifts at overlapping times, across every study center (or
 * one, with `tenantId`). Read-only. Each row names the tenant, the seat and both holds
 * so an owner can decide which to move or end.
 */
export async function collectSeatOverlaps({ tenantId } = {}) {
  const allocations = await SeatAllocation.find(
    { status: 'active', ...(tenantId ? { tenantId } : {}) },
    null,
    ACROSS_TENANTS
  ).lean();
  if (!allocations.length) return [];

  const ids = (key) => [...new Set(allocations.map((a) => String(a[key])))];
  const [sections, seats, students, tenants] = await Promise.all([
    Section.find(
      { _id: { $in: ids('sectionId') } },
      'name startTime endTime',
      ACROSS_TENANTS
    ).lean(),
    Seat.find({ _id: { $in: ids('seatId') } }, 'label', ACROSS_TENANTS).lean(),
    Student.find({ _id: { $in: ids('studentId') } }, 'firstName lastName', ACROSS_TENANTS).lean(),
    Tenant.find({ _id: { $in: ids('tenantId') } }, 'name subdomain').lean(),
  ]);
  const byId = (docs) => new Map(docs.map((d) => [String(d._id), d]));
  const sectionById = byId(sections);
  const seatById = byId(seats);
  const studentById = byId(students);
  const tenantById = byId(tenants);

  const describe = (hold) => {
    const section = sectionById.get(String(hold.sectionId));
    const student = studentById.get(String(hold.studentId));
    return {
      allocationId: String(hold._id),
      studentId: String(hold.studentId),
      student: student ? fullName(student) : 'unknown learner',
      shift: section?.name ?? 'unknown shift',
      startTime: section?.startTime ?? null,
      endTime: section?.endTime ?? null,
    };
  };

  return findOverlappingHolds(allocations, sectionById).map(({ first, second }) => {
    const tenant = tenantById.get(String(first.tenantId));
    return {
      tenantId: String(first.tenantId),
      tenant: tenant?.subdomain ?? tenant?.name ?? String(first.tenantId),
      seat: seatById.get(String(first.seatId))?.label ?? String(first.seatId),
      first: describe(first),
      second: describe(second),
    };
  });
}

/** One line per side: "Asha Rana in Morning (06:00–14:00)". */
export function formatOverlapHold({ student, shift, startTime, endTime }) {
  const hours =
    !startTime && !endTime ? 'all day' : `${startTime ?? '00:00'}–${endTime ?? '24:00'}`;
  return `${student} in ${shift} (${hours})`;
}
