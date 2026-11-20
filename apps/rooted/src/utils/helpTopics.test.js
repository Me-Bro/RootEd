import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HELP_TOPICS, visibleTopics, topicsForPath } from './helpTopics.js';

const keys = (list) => list.map((t) => t.key);

test('visibleTopics keeps only topics the user has the permission and module for', () => {
  const on = () => true;
  assert.deepEqual(visibleTopics([], on), []);
  const teacher = visibleTopics(['attendance:write', 'grades:write'], on);
  assert.deepEqual(keys(teacher), ['myClasses', 'takeAttendance', 'enterGrades']);
  const noStaff = visibleTopics(['staff:write', 'tenant:admin'], (m) => m !== 'staff');
  assert.ok(!keys(noStaff).includes('addStaff'));
  assert.ok(keys(noStaff).includes('addYear'));
});

test('a study center gets centre topics only, a school gets school topics only', () => {
  const on = () => true;
  const owner = [
    'tenant:admin',
    'staff:write',
    'students:write',
    'fees:write',
    'attendance:write',
    'grades:write',
  ];
  const centre = keys(visibleTopics(owner, on, HELP_TOPICS, true));
  const school = keys(visibleTopics(owner, on, HELP_TOPICS, false));
  // Screens a study center has hidden must never be offered as help.
  for (const k of ['addClass', 'addSubject', 'buildTimetable', 'takeAttendance', 'enterGrades']) {
    assert.ok(!centre.includes(k), `centre should not see ${k}`);
    assert.ok(school.includes(k), `school should see ${k}`);
  }
  for (const k of ['addShift', 'addSeats', 'addPlan', 'seatMember', 'checkInOut']) {
    assert.ok(centre.includes(k), `centre should see ${k}`);
    assert.ok(!school.includes(k), `school should not see ${k}`);
  }
  assert.ok(centre.includes('addStaff') && school.includes('addStaff'));
  // Front desk staff: check-in/out only, none of the owner's setup topics.
  assert.deepEqual(keys(visibleTopics(['attendance:write'], on, HELP_TOPICS, true)), [
    'checkInOut',
  ]);
});

test('topicsForPath puts the page topics first and matches sub-routes', () => {
  const { here, rest } = topicsForPath(HELP_TOPICS, '/academic/subjects');
  assert.deepEqual(keys(here), ['addSubject', 'assignTeacher']);
  assert.equal(here.length + rest.length, HELP_TOPICS.length);
  assert.deepEqual(keys(topicsForPath(HELP_TOPICS, '/staff/123').here), ['addStaff']);
  assert.deepEqual(keys(topicsForPath(HELP_TOPICS, '/staffing').here), []);
});

test('every topic has its title and every step in en and hi', () => {
  for (const lang of ['en', 'hi']) {
    const file = new URL(`../i18n/locales/${lang}.json`, import.meta.url);
    const topics = JSON.parse(readFileSync(file, 'utf8')).help.topics;
    for (const { key, steps } of HELP_TOPICS) {
      assert.ok(topics[key]?.title, `${lang}: ${key}.title`);
      for (let i = 1; i <= steps; i++)
        assert.ok(topics[key][`step${i}`], `${lang}: ${key}.step${i}`);
    }
  }
});
