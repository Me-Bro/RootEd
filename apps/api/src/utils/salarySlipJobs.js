/**
 * Finds an already-queued/active salary-slip job covering the same
 * tenant+month+year+staff member, so a double-click on "Generate" reuses
 * it instead of enqueueing a duplicate.
 */
export function findMatchingSalaryJob(jobs, { tenantId, month, year, staffId }) {
  return (
    jobs.find(
      (job) =>
        job.data?.tenantId === tenantId &&
        job.data?.month === month &&
        job.data?.year === year &&
        (job.data?.staffIds ?? []).includes(staffId)
    ) ?? null
  );
}
