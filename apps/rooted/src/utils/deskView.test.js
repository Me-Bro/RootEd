import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESK_FILTER_KEYS,
  canCheckOutAll,
  groupByZone,
  landsOnDesk,
  minutesSince,
  seatClickAction,
} from './deskView.js';

test('minutes since check-in are whole and never negative', () => {
  const now = new Date('2026-05-11T08:00:00Z');
  assert.equal(minutesSince('2026-05-11T05:50:00Z', now), 130);
  assert.equal(minutesSince('2026-05-11T09:00:00Z', now), 0);
});

test('seats group by zone in first-seen order, zoneless seats last', () => {
  const tiles = [
    { label: 'A-1', zone: null },
    { label: 'B-1', zone: 'Quiet' },
    { label: 'A-2', zone: null },
    { label: 'C-1', zone: 'Group' },
    { label: 'B-2', zone: 'Quiet' },
  ];
  assert.deepEqual(
    groupByZone(tiles).map((g) => [g.zone, g.seats.map((s) => s.label)]),
    [
      ['Quiet', ['B-1', 'B-2']],
      ['Group', ['C-1']],
      [null, ['A-1', 'A-2']],
    ]
  );
});

test('an occupied seat offers check-out for whoever is on it, with or without a picked learner', () => {
  const tile = { state: 'occupied', occupant: { visitId: 'v1' }, seatId: 's1' };
  assert.deepEqual(seatClickAction(tile, null), { type: 'checkOut', visitId: 'v1' });
  assert.deepEqual(seatClickAction(tile, { _id: 'a' }), { type: 'checkOut', visitId: 'v1' });
});

test('a free or held seat checks the picked learner in', () => {
  for (const state of ['free', 'held']) {
    assert.deepEqual(seatClickAction({ state, seatId: 's2' }, { _id: 'a', inside: null }), {
      type: 'checkIn',
      studentId: 'a',
      seatId: 's2',
    });
  }
});

test('with nobody picked, or a learner already inside, a free seat does not check in', () => {
  assert.deepEqual(seatClickAction({ state: 'free', seatId: 's2' }, null), {
    type: 'pickLearner',
  });
  assert.deepEqual(
    seatClickAction({ state: 'free', seatId: 's2' }, { _id: 'a', inside: { visitId: 'v' } }),
    { type: 'alreadyInside' }
  );
});

test('only an owner gets the check-out-everyone button', () => {
  assert.equal(canCheckOutAll(['tenant:admin', 'attendance:write']), true);
  assert.equal(canCheckOutAll(['attendance:write', 'fees:read']), false);
  assert.equal(canCheckOutAll(), false);
});

test('the filter names match the API', () => {
  assert.deepEqual(DESK_FILTER_KEYS, ['all', 'inside', 'notInside', 'warning']);
});

test('desk staff at a study center land on the desk; owners and other org types do not', () => {
  assert.equal(landsOnDesk({ seats: true, permissions: ['attendance:write', 'fees:read'] }), true);
  assert.equal(
    landsOnDesk({ seats: true, permissions: ['attendance:write', 'tenant:admin'] }),
    false
  );
  assert.equal(landsOnDesk({ seats: true, permissions: ['attendance:read'] }), false);
  assert.equal(landsOnDesk({ seats: false, permissions: ['attendance:write'] }), false);
});
