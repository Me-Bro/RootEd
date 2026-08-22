import { findMatchingJob } from '../utils/reportCardJobs.js';

function job(id, data) {
  return { id, data };
}

test('returns the job matching tenantId+sectionId+termId', () => {
  const jobs = [
    job('1', { tenantId: 't1', sectionId: 's1', termId: 'term1' }),
    job('2', { tenantId: 't1', sectionId: 's2', termId: 'term1' }),
  ];

  const match = findMatchingJob(jobs, { tenantId: 't1', sectionId: 's2', termId: 'term1' });
  expect(match.id).toBe('2');
});

test('returns null when no job matches', () => {
  const jobs = [job('1', { tenantId: 't1', sectionId: 's1', termId: 'term1' })];
  const match = findMatchingJob(jobs, { tenantId: 't1', sectionId: 's2', termId: 'term1' });
  expect(match).toBeNull();
});

test('does not match a job from a different tenant even with the same section/term ids', () => {
  const jobs = [job('1', { tenantId: 't2', sectionId: 's1', termId: 'term1' })];
  const match = findMatchingJob(jobs, { tenantId: 't1', sectionId: 's1', termId: 'term1' });
  expect(match).toBeNull();
});

test('returns the first match when multiple jobs somehow match', () => {
  const jobs = [
    job('1', { tenantId: 't1', sectionId: 's1', termId: 'term1' }),
    job('2', { tenantId: 't1', sectionId: 's1', termId: 'term1' }),
  ];
  const match = findMatchingJob(jobs, { tenantId: 't1', sectionId: 's1', termId: 'term1' });
  expect(match.id).toBe('1');
});
