import test from 'node:test';
import assert from 'node:assert/strict';
import { freeSeats, seatOptionLabel, shiftsToOffer } from './seatOptions.js';

test('only seats nobody holds and nothing blocks are offered', () => {
  const items = [
    { seatId: 1, label: 'A-1', heldBy: null, blockedBy: null },
    { seatId: 2, label: 'A-2', heldBy: { name: 'x' }, blockedBy: null },
    { seatId: 3, label: 'A-3', heldBy: null, blockedBy: { name: 'y' } },
  ];
  assert.deepEqual(
    freeSeats(items).map((s) => s.label),
    ['A-1']
  );
  assert.deepEqual(freeSeats(), []);
});

test('a shift the learner already has a seat in is not offered again', () => {
  const sections = [{ _id: 'm' }, { _id: 'e' }, { _id: 'n' }];
  const allocations = [{ sectionId: { _id: 'm' } }, { sectionId: 'e' }];
  assert.deepEqual(
    shiftsToOffer(sections, allocations).map((s) => s._id),
    ['n']
  );
  assert.equal(shiftsToOffer(sections, []).length, 3);
});

test('a seat label includes its zone when it has one', () => {
  assert.equal(seatOptionLabel({ label: 'A-1', zone: 'Hall 1' }), 'A-1 · Hall 1');
  assert.equal(seatOptionLabel({ label: 'A-1', zone: null }), 'A-1');
});
