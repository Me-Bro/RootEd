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

test('a study center has no terms, subjects or teaching steps', () => {
  const keys = setupSteps({ ...empty, seats: true }).map((s) => s.key);
  assert.deepEqual(keys, ['years', 'classes', 'staff', 'students']);
});

test('a study center that has a year, a shift and a learner is fully set up', () => {
  const steps = setupSteps({
    ...empty,
    seats: true,
    years: [{}],
    classes: [{ sections: [{}] }],
    staffTotal: 2,
    studentsTotal: 5,
  });
  assert.equal(done(steps).length, steps.length);
});

test('without seats the existing step list is unchanged', () => {
  assert.equal(setupSteps({ ...empty, seats: false }).length, 7);
});
