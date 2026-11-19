import { buildAvailability, bulkLabels, bySeatLabel } from '../utils/seatAvailability.js';

const seat = (label, extra = {}) => ({ _id: `id-${label}`, label, isActive: true, ...extra });
const hold = (seatLabel, studentId, sectionId) => ({
  _id: `alloc-${seatLabel}-${sectionId}`,
  seatId: `id-${seatLabel}`,
  studentId,
  sectionId,
});

describe('bySeatLabel', () => {
  test('orders numbers inside a label naturally, so A-2 comes before A-10', () => {
    const labels = ['A-10', 'A-2', 'B-1', 'A-1'].map((label) => ({ label }));
    expect(labels.sort(bySeatLabel).map((s) => s.label)).toEqual(['A-1', 'A-2', 'A-10', 'B-1']);
  });
});

describe('bulkLabels', () => {
  test('a prefix, a count and a start', () => {
    expect(bulkLabels({ prefix: 'A-', count: 3 })).toEqual(['A-1', 'A-2', 'A-3']);
    expect(bulkLabels({ prefix: 'B-', count: 2, start: 7 })).toEqual(['B-7', 'B-8']);
  });

  test('no prefix gives plain numbers', () => {
    expect(bulkLabels({ count: 2 })).toEqual(['1', '2']);
  });
});

describe('buildAvailability', () => {
  const seats = [seat('A-1'), seat('A-2'), seat('A-3'), seat('A-4', { isActive: false })];
  const names = { s1: 'Asha Rana', s2: 'Ravi Kumar' };
  const holderName = (id) => names[id];

  test('shows who holds each seat in the chosen shift', () => {
    const morning = [hold('A-1', 's1', 'morning')];
    const result = buildAvailability({
      seats,
      shiftAllocations: morning,
      anyAllocations: morning,
      holderName,
    });
    expect(result.items.map((i) => [i.label, i.heldBy?.name ?? null])).toEqual([
      ['A-1', 'Asha Rana'],
      ['A-2', null],
      ['A-3', null],
    ]);
    expect(result.heldCount).toBe(1);
  });

  test('an inactive seat is not listed and never counts', () => {
    const result = buildAvailability({
      seats,
      shiftAllocations: [],
      anyAllocations: [],
      holderName,
    });
    expect(result.items.map((i) => i.label)).not.toContain('A-4');
    expect(result.poolSize).toBe(3);
  });

  test('the pool is seats nobody holds in any shift', () => {
    const morning = [hold('A-1', 's1', 'morning')];
    const evening = [hold('A-2', 's2', 'evening')];
    const result = buildAvailability({
      seats,
      shiftAllocations: morning,
      anyAllocations: [...morning, ...evening],
      holderName,
    });
    // A-1 is held in Morning, A-2 in Evening: only A-3 is open to a day pass.
    expect(result.poolSize).toBe(1);
  });

  test('a seat shared by two shifts is closed to day passes once, not twice', () => {
    const both = [hold('A-1', 's1', 'morning'), hold('A-1', 's2', 'evening')];
    const result = buildAvailability({
      seats,
      shiftAllocations: [both[0]],
      anyAllocations: both,
      holderName,
    });
    expect(result.poolSize).toBe(2);
  });

  describe('seats held in an overlapping shift', () => {
    const evening = { name: 'Evening', startTime: '16:00', endTime: '20:00' };
    const clash = (seatLabel, studentId, section = evening) => ({
      seatId: `id-${seatLabel}`,
      studentId,
      sectionId: 'evening',
      section,
    });

    test('are marked blocked, with who holds them and where', () => {
      const result = buildAvailability({
        seats,
        shiftAllocations: [],
        anyAllocations: [hold('A-2', 's2', 'evening')],
        overlapping: [clash('A-2', 's2')],
        holderName,
      });
      expect(result.items.find((i) => i.label === 'A-2').blockedBy).toEqual({
        name: 'Ravi Kumar',
        sectionName: 'Evening',
        startTime: '16:00',
        endTime: '20:00',
      });
      expect(result.items.find((i) => i.label === 'A-3').blockedBy).toBeNull();
    });

    test('a shift with no hours reports null times', () => {
      const result = buildAvailability({
        seats,
        shiftAllocations: [],
        anyAllocations: [hold('A-2', 's2', 'evening')],
        overlapping: [clash('A-2', 's2', { name: 'Anytime' })],
        holderName,
      });
      expect(result.items.find((i) => i.label === 'A-2').blockedBy).toMatchObject({
        sectionName: 'Anytime',
        startTime: null,
        endTime: null,
      });
    });

    test('a seat held in the chosen shift itself is held, not blocked', () => {
      const own = hold('A-1', 's1', 'morning');
      const result = buildAvailability({
        seats,
        shiftAllocations: [own],
        anyAllocations: [own, hold('A-1', 's2', 'evening')],
        overlapping: [clash('A-1', 's2')],
        holderName,
      });
      const a1 = result.items.find((i) => i.label === 'A-1');
      expect(a1.heldBy.name).toBe('Asha Rana');
      expect(a1.blockedBy).toBeNull();
    });

    test('does not change the day-pass pool', () => {
      const other = hold('A-2', 's2', 'evening');
      const result = buildAvailability({
        seats,
        shiftAllocations: [],
        anyAllocations: [other],
        overlapping: [clash('A-2', 's2')],
        holderName,
      });
      expect(result.poolSize).toBe(2);
      expect(result.heldCount).toBe(0);
    });

    test('without any overlapping holds nothing is blocked', () => {
      const result = buildAvailability({
        seats,
        shiftAllocations: [],
        anyAllocations: [],
        holderName,
      });
      expect(result.items.every((i) => i.blockedBy === null)).toBe(true);
    });
  });

  test('items come back in natural label order', () => {
    const many = [seat('A-10'), seat('A-9'), seat('A-1')];
    const result = buildAvailability({
      seats: many,
      shiftAllocations: [],
      anyAllocations: [],
      holderName,
    });
    expect(result.items.map((i) => i.label)).toEqual(['A-1', 'A-9', 'A-10']);
  });
});
