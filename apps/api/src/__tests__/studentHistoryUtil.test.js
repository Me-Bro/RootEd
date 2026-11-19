import {
  historyTypeOf,
  actionFilterFor,
  buildHistoryEntry,
  referencedIds,
} from '../utils/studentHistory.js';

const lookups = () => ({ actors: new Map(), seats: new Map(), sections: new Map() });

describe('historyTypeOf', () => {
  test.each([
    ['student.create', 'profile'],
    ['student.update', 'profile'],
    ['student.aadhaar_revealed', 'profile'],
    ['walkIn.create', 'profile'],
    ['visit.checkOut', 'visit'],
    ['seatAllocation.end', 'seat'],
    ['feePayment.record', 'fee'],
    ['feeSale.void', 'fee'],
    ['feeAssignment.waive', 'fee'],
    ['student.feePlan.pause', 'fee'],
    ['student.feeStructure.add', 'fee'],
    ['tenant.updated', 'other'],
  ])('%s is %s', (action, type) => {
    expect(historyTypeOf(action)).toBe(type);
  });
});

describe('actionFilterFor', () => {
  test('the query filter agrees with the classifier for every type', () => {
    const actions = [
      'student.create',
      'student.feePlan.set',
      'visit.checkIn',
      'seatAllocation.create',
      'feeSale.create',
      'walkIn.eraseContact',
    ];
    for (const type of ['profile', 'visit', 'seat', 'fee']) {
      const re = new RegExp(actionFilterFor(type).action.$regex);
      for (const action of actions) {
        expect(re.test(action)).toBe(historyTypeOf(action) === type);
      }
    }
  });

  test('an unknown type has no filter', () => {
    expect(actionFilterFor('bogus')).toBeNull();
  });
});

describe('buildHistoryEntry', () => {
  const base = { _id: 'e1', at: new Date('2026-01-01'), actorId: 'u1' };

  test('never carries before/after, and an Aadhaar field is dropped from changes', () => {
    const entry = buildHistoryEntry(
      {
        ...base,
        action: 'student.update',
        before: { aadhaarLast4: '1234', phone: '1' },
        after: { aadhaarLast4: '9876', phone: '2' },
      },
      lookups()
    );
    expect(entry).not.toHaveProperty('before');
    expect(entry.changes).toEqual([{ field: 'phone', before: '1', after: '2' }]);
    expect(JSON.stringify(entry)).not.toMatch(/1234|9876/);
  });

  test('a missing actor or unresolved names are null, not an error', () => {
    const entry = buildHistoryEntry(
      { _id: 'e2', at: new Date(), action: 'visit.checkIn', after: { seatId: 's9' } },
      lookups()
    );
    expect(entry.actor).toBeNull();
    expect(entry.params.seat).toBeNull();
  });

  test('a fee plan set reports its latest segment', () => {
    const entry = buildHistoryEntry(
      {
        ...base,
        action: 'student.feePlan.set',
        after: {
          billing: {
            segments: [
              { cycle: 'monthly', amount: 1000, from: 'a' },
              { cycle: 'weekly', amount: 300, from: 'b' },
            ],
          },
        },
      },
      lookups()
    );
    expect(entry.params).toEqual({ cycle: 'weekly', amount: 300, from: 'b' });
  });
});

describe('referencedIds', () => {
  test('collects distinct seat and section ids from both sides', () => {
    const out = referencedIds([
      { before: { seatId: 's1', sectionId: 'c1' }, after: { seatId: 's2', sectionId: 'c1' } },
      { after: { seatId: 's1' } },
      {},
    ]);
    expect(out.seatIds.sort()).toEqual(['s1', 's2']);
    expect(out.sectionIds).toEqual(['c1']);
  });
});

describe('enrolment entries', () => {
  test('name the shift joined', () => {
    const l = { ...lookups(), sections: new Map([['c1', 'Morning']]) };
    const entry = buildHistoryEntry(
      { _id: 'e3', at: new Date(), action: 'student.enrolled', after: { sectionId: 'c1' } },
      l
    );
    expect(entry.params).toEqual({ shift: 'Morning' });
    expect(entry.type).toBe('profile');
  });
});
