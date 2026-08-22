import { filterVisibleTimetableEntries } from '../utils/timetableVisibility.js';

const entries = [
  { _id: 'e1', academicYearId: 'y1', sectionId: 's1' },
  { _id: 'e2', academicYearId: 'y1', sectionId: 's2' },
  { _id: 'e3', academicYearId: 'y2', sectionId: 's1' },
];

test('admin sees every entry regardless of publish state', () => {
  const result = filterVisibleTimetableEntries(entries, new Set(), true);
  expect(result).toEqual(entries);
});

test('non-admin sees only entries whose year/section is published', () => {
  const published = new Set(['y1:s1']);
  const result = filterVisibleTimetableEntries(entries, published, false);
  expect(result.map((e) => e._id)).toEqual(['e1']);
});

test('non-admin with no published sections sees nothing', () => {
  const result = filterVisibleTimetableEntries(entries, new Set(), false);
  expect(result).toEqual([]);
});

test('non-admin sees entries across multiple published year/section pairs', () => {
  const published = new Set(['y1:s2', 'y2:s1']);
  const result = filterVisibleTimetableEntries(entries, published, false);
  expect(result.map((e) => e._id).sort()).toEqual(['e2', 'e3']);
});
