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
