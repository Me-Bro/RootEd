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
