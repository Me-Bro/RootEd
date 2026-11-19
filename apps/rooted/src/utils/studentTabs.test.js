import test from 'node:test';
import assert from 'node:assert/strict';
import { availableTabs } from './studentTabs.js';

const member = { kind: 'member' };

test('the owner sees every tab', () => {
  assert.deepEqual(
    availableTabs({ permissions: ['attendance:read', 'fees:read'], student: member }),
    ['overview', 'visits', 'billing', 'history']
  );
});

test('the front desk sees visits and billing too', () => {
  assert.deepEqual(
    availableTabs({
      permissions: ['students:read', 'attendance:read', 'fees:read'],
      student: member,
    }),
    ['overview', 'visits', 'billing', 'history']
  );
});

test('a teacher without fees:read has no billing tab', () => {
  assert.deepEqual(
    availableTabs({ permissions: ['students:read', 'attendance:read'], student: member }),
    ['overview', 'visits', 'history']
  );
});

test('a walk-in has no billing tab even for someone who may read fees', () => {
  assert.deepEqual(
    availableTabs({
      permissions: ['attendance:read', 'fees:read'],
      student: { kind: 'walk_in' },
    }),
    ['overview', 'visits', 'history']
  );
});

test('with no permissions only the overview and history remain', () => {
  assert.deepEqual(availableTabs({ permissions: [], student: member }), ['overview', 'history']);
});
