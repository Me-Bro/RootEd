import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupSteps } from './setupSteps.js';

const empty = {
  years: [],
  terms: [],
  classes: [],
  subjects: [],
  staffTotal: 0,
  assignments: [],
  studentsTotal: 0,
};
const done = (steps) => steps.filter((s) => s.done).map((s) => s.key);

test('a new school has every step open, in setup order', () => {
  const steps = setupSteps(empty);
  assert.deepEqual(
    steps.map((s) => s.key),
    ['years', 'terms', 'classes', 'subjects', 'staff', 'teaching', 'students']
  );
  assert.deepEqual(done(steps), []);
});

test('a class only counts once it has a section', () => {
  assert.deepEqual(done(setupSteps({ ...empty, classes: [{ sections: [] }] })), []);
  assert.deepEqual(done(setupSteps({ ...empty, classes: [{ sections: [{}] }] })), ['classes']);
});

test('each step ticks from its own data', () => {
  const steps = setupSteps({
    years: [{}],
    terms: [{}],
    classes: [{ sections: [{}] }],
    subjects: [{}],
    staffTotal: 3,
    assignments: [{}],
    studentsTotal: 10,
  });
  assert.equal(done(steps).length, 7);
});

test('the staff step is left out when staffTotal is unknown (staff module off)', () => {
  const keys = setupSteps({ ...empty, staffTotal: undefined }).map((s) => s.key);
  assert.ok(!keys.includes('staff'));
});

test('every step links to the page that completes it', () => {
  const to = Object.fromEntries(setupSteps(empty).map((s) => [s.key, s.to]));
  assert.equal(to.terms, '/academic/years');
  assert.equal(to.teaching, '/academic/subjects');
  assert.equal(to.students, '/academic/students');
});

test('a study center gets its own four steps, in order', () => {
  const steps = setupSteps({ ...empty, seats: true, planCount: 0 });
  assert.deepEqual(
    steps.map((s) => s.key),
    ['shifts', 'seats', 'plans', 'members']
  );
  assert.deepEqual(done(steps), []);
});

test('a study center never asks for a year, terms, subjects, teachers or staff', () => {
  const keys = setupSteps({ ...empty, seats: true, planCount: 0, staffTotal: 0 }).map((s) => s.key);
  for (const k of ['years', 'terms', 'subjects', 'staff', 'teaching']) assert.ok(!keys.includes(k));
});

test('each study center step ticks from its own data and links to its page', () => {
  const steps = setupSteps({
    ...empty,
    seats: true,
    classes: [{ sections: [{}] }],
    seatCount: 12,
    planCount: 2,
    studentsTotal: 5,
  });
  assert.equal(done(steps).length, 4);
  assert.deepEqual(
    steps.map((s) => s.to),
    ['/academic/classes-sections', '/academic/seats', '/fee/structures', '/academic/students']
  );
});

test('the plans step is left out when planCount is unknown (fee module off)', () => {
  const keys = setupSteps({ ...empty, seats: true }).map((s) => s.key);
  assert.deepEqual(keys, ['shifts', 'seats', 'members']);
});

test('without seats the existing step list is unchanged', () => {
  assert.equal(setupSteps({ ...empty, seats: false }).length, 7);
});
