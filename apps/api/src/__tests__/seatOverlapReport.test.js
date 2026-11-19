// The overlap finder (pure) and the cross-tenant report built on it, against an
// in-memory Mongo. The report is read-only: it must never change an allocation.
import { findOverlappingHolds } from '../utils/seatOverlaps.js';

const { MongoMemoryServer } = await import('mongodb-memory-server');
const { default: mongoose } = await import('mongoose');
const { Tenant } = await import('../models/Tenant.js');
const { Student } = await import('../models/Student.js');
const { Section } = await import('../models/Section.js');
const { Class } = await import('../models/Class.js');
const { Seat } = await import('../models/Seat.js');
const { SeatAllocation } = await import('../models/SeatAllocation.js');
const { collectSeatOverlaps, formatOverlapHold } =
  await import('../services/seatOverlapReport.service.js');

describe('findOverlappingHolds', () => {
  const sections = new Map([
    ['am', { startTime: '06:00', endTime: '14:00' }],
    ['mid', { startTime: '12:00', endTime: '18:00' }],
    ['pm', { startTime: '14:00', endTime: '22:00' }],
    ['any', {}],
  ]);
  const hold = (seatId, sectionId, extra = {}) => ({
    _id: `${seatId}-${sectionId}`,
    tenantId: 't1',
    seatId,
    sectionId,
    ...extra,
  });
  const ids = (pairs) => pairs.map((p) => [p.first.sectionId, p.second.sectionId]);

  test('finds a seat held in two shifts that overlap', () => {
    expect(ids(findOverlappingHolds([hold('s1', 'am'), hold('s1', 'mid')], sections))).toEqual([
      ['am', 'mid'],
    ]);
  });

  test('adjacent shifts are fine', () => {
    expect(findOverlappingHolds([hold('s1', 'am'), hold('s1', 'pm')], sections)).toEqual([]);
  });

  test('a shift with no hours overlaps every other', () => {
    expect(findOverlappingHolds([hold('s1', 'pm'), hold('s1', 'any')], sections)).toHaveLength(1);
  });

  test('different seats, and the same seat id in another tenant, never pair up', () => {
    expect(findOverlappingHolds([hold('s1', 'am'), hold('s2', 'mid')], sections)).toEqual([]);
    expect(
      findOverlappingHolds([hold('s1', 'am'), hold('s1', 'mid', { tenantId: 't2' })], sections)
    ).toEqual([]);
  });

  test('three mutually overlapping holds give three pairs, each once', () => {
    const holds = [hold('s1', 'am'), hold('s1', 'mid'), hold('s1', 'any')];
    expect(findOverlappingHolds(holds, sections)).toHaveLength(3);
  });

  test('a hold in an unknown section is skipped', () => {
    expect(findOverlappingHolds([hold('s1', 'am'), hold('s1', 'gone')], sections)).toEqual([]);
  });
});

describe('formatOverlapHold', () => {
  test('shows the hours, or "all day" when the shift has none', () => {
    expect(
      formatOverlapHold({ student: 'Asha', shift: 'Morning', startTime: '06:00', endTime: '14:00' })
    ).toBe('Asha in Morning (06:00–14:00)');
    expect(formatOverlapHold({ student: 'Ravi', shift: 'Anytime' })).toBe(
      'Ravi in Anytime (all day)'
    );
    expect(formatOverlapHold({ student: 'Meena', shift: 'Late', startTime: '21:00' })).toBe(
      'Meena in Late (21:00–24:00)'
    );
  });
});

describe('collectSeatOverlaps', () => {
  let mongod;
  const world = {};

  async function makeShift(tenant, name, startTime, endTime) {
    const hours = { ...(startTime && { startTime }), ...(endTime && { endTime }) };
    const cls = await Class.create({ tenantId: tenant._id, name, ...hours });
    return Section.create({ tenantId: tenant._id, classId: cls._id, name, ...hours });
  }
  const makeStudent = (tenant, no, firstName) =>
    Student.create({ tenantId: tenant._id, admissionNo: no, firstName, lastName: 'Report' });
  const hold = (tenant, seat, student, section, status = 'active') =>
    SeatAllocation.create({
      tenantId: tenant._id,
      seatId: seat._id,
      studentId: student._id,
      sectionId: section._id,
      status,
    });

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await SeatAllocation.syncIndexes();

    const tenants = {
      a: await Tenant.create({ name: 'A', subdomain: 'rep-a', orgType: 'study_center' }),
      b: await Tenant.create({ name: 'B', subdomain: 'rep-b', orgType: 'study_center' }),
    };
    for (const key of ['a', 'b']) {
      const t = tenants[key];
      const morning = await makeShift(t, 'Morning', '06:00', '14:00');
      const midday = await makeShift(t, 'Midday', '12:00', '18:00');
      const evening = await makeShift(t, 'Evening', '14:00', '22:00');
      const seat = await Seat.create({ tenantId: t._id, label: 'A-1' });
      const clear = await Seat.create({ tenantId: t._id, label: 'A-2' });
      const ana = await makeStudent(t, `${key}-1`, 'Ana');
      const bo = await makeStudent(t, `${key}-2`, 'Bo');
      // A-1: Morning + Midday overlap. A-2: Morning + Evening are only adjacent.
      await hold(t, seat, ana, morning);
      await hold(t, seat, bo, midday);
      await hold(t, clear, ana, evening);
      await hold(t, clear, bo, morning);
      world[key] = { tenant: t, seat, midday };
    }
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  test('reports overlapping seats in every tenant, naming tenant, seat, learners and shifts', async () => {
    const rows = await collectSeatOverlaps();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.tenant).sort()).toEqual(['rep-a', 'rep-b']);
    const row = rows.find((r) => r.tenant === 'rep-a');
    expect(row.seat).toBe('A-1');
    expect(formatOverlapHold(row.first)).toBe('Ana Report in Morning (06:00–14:00)');
    expect(formatOverlapHold(row.second)).toBe('Bo Report in Midday (12:00–18:00)');
  });

  test('can be limited to one tenant', async () => {
    const rows = await collectSeatOverlaps({ tenantId: world.b.tenant._id });
    expect(rows.map((r) => r.tenant)).toEqual(['rep-b']);
  });

  test('ended holds do not count', async () => {
    const { tenant, seat, midday } = world.a;
    await SeatAllocation.updateMany(
      { tenantId: tenant._id, seatId: seat._id, sectionId: midday._id },
      { $set: { status: 'ended' } }
    );
    expect((await collectSeatOverlaps({ tenantId: tenant._id })).length).toBe(0);
  });

  test('is read-only: running it changes no allocation', async () => {
    const before = await SeatAllocation.find({}, null, { _bypassTenantScope: true }).lean();
    await collectSeatOverlaps();
    const after = await SeatAllocation.find({}, null, { _bypassTenantScope: true }).lean();
    expect(after).toEqual(before);
  });
});
