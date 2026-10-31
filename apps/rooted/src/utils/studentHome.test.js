import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentAndNext,
  absentRun,
  absentRunRecords,
  nextClassDay,
  recentStrip,
} from './studentHome.js';

// Friday 30 Oct 2026, local time. Periods match Grade 5-A's seeded Friday.
const fri = (h, m) => new Date(2026, 9, 30, h, m);
const sat = new Date(2026, 9, 31, 10, 38);
const entry = (periodNumber, startTime, endTime, name, dayOfWeek = 5) => ({
  dayOfWeek,
  periodNumber,
  startTime,
  endTime,
  subjectId: { name },
});
const timetable = [
  entry(5, '11:15', '12:00', 'English'),
  entry(4, '10:30', '11:15', 'Mathematics'),
  entry(6, '12:45', '13:30', 'Science'),
  entry(1, '08:00', '08:45', 'Hindi', 1),
];

test('live period gives current, next and minutes left', () => {
  const r = currentAndNext(timetable, fri(10, 38));
  assert.equal(r.current.subjectId.name, 'Mathematics');
  assert.equal(r.next.subjectId.name, 'English');
  assert.equal(r.minutesLeft, 37);
});

test('between periods (lunch) has no current and counts down to next', () => {
  const r = currentAndNext(timetable, fri(12, 33));
  assert.equal(r.current, null);
  assert.equal(r.next.subjectId.name, 'Science');
  assert.equal(r.minutesToNext, 12);
});

test('period end is exclusive', () => {
  assert.equal(currentAndNext(timetable, fri(11, 15)).current.subjectId.name, 'English');
});

test('after the last period there is nothing next but the day had classes', () => {
  const r = currentAndNext(timetable, fri(16, 0));
  assert.equal(r.current, null);
  assert.equal(r.next, null);
  assert.equal(r.hasClassesToday, true);
});

test('weekend and other days leave the hero empty', () => {
  const r = currentAndNext(timetable, sat);
  assert.equal(r.hasClassesToday, false);
  assert.equal(currentAndNext([], fri(10, 38)).hasClassesToday, false);
});

const rec = (date, status) => ({ date, status });
const records = [
  rec('2026-10-27', 'present'),
  rec('2026-10-30', 'absent'),
  rec('2026-10-29', 'absent'),
  rec('2026-10-28', 'absent'),
  rec('2026-10-26', 'present'),
];

test('absentRun counts consecutive absences from the newest day, whatever the input order', () => {
  assert.equal(absentRun(records), 3);
  assert.equal(absentRun([rec('2026-10-30', 'late'), rec('2026-10-29', 'absent')]), 0);
  assert.equal(absentRun([]), 0);
});

test('recentStrip returns the newest n records first', () => {
  const s = recentStrip(records, 3);
  assert.deepEqual(
    s.map((r) => r.date),
    ['2026-10-30', '2026-10-29', '2026-10-28']
  );
});

test('absentRunRecords lists the run newest first', () => {
  assert.deepEqual(
    absentRunRecords(records).map((r) => r.date),
    ['2026-10-30', '2026-10-29', '2026-10-28']
  );
});

test('nextClassDay finds the next weekday with classes, skipping the weekend', () => {
  assert.equal(nextClassDay(timetable, sat).getDay(), 1);
  assert.equal(nextClassDay(timetable, fri(16, 0)).getDate(), 2);
  assert.equal(nextClassDay([], fri(16, 0)), null);
});
