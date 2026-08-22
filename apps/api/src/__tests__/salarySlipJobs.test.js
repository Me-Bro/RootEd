import { findMatchingSalaryJob } from '../utils/salarySlipJobs.js';

const jobs = [
  { data: { tenantId: 't1', month: 1, year: 2024, staffIds: ['s1', 's2'] } },
  { data: { tenantId: 't1', month: 2, year: 2024, staffIds: ['s3'] } },
  { data: { tenantId: 't2', month: 1, year: 2024, staffIds: ['s1'] } },
];

test('finds a job matching tenant, month, year, and containing the staffId', () => {
  expect(findMatchingSalaryJob(jobs, { tenantId: 't1', month: 1, year: 2024, staffId: 's2' })).toBe(
    jobs[0]
  );
});

test('returns null when no job matches the staffId even if tenant/period match', () => {
  expect(
    findMatchingSalaryJob(jobs, { tenantId: 't1', month: 1, year: 2024, staffId: 's3' })
  ).toBeNull();
});

test('returns null when tenant differs', () => {
  expect(
    findMatchingSalaryJob(jobs, { tenantId: 't2', month: 2, year: 2024, staffId: 's3' })
  ).toBeNull();
});

test('returns null when period differs', () => {
  expect(
    findMatchingSalaryJob(jobs, { tenantId: 't1', month: 3, year: 2024, staffId: 's1' })
  ).toBeNull();
});

test('returns null against an empty job list', () => {
  expect(
    findMatchingSalaryJob([], { tenantId: 't1', month: 1, year: 2024, staffId: 's1' })
  ).toBeNull();
});
