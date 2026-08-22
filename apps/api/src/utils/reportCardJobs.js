/**
 * Finds an already-queued/active report-card job for the same tenant+section+term,
 * so a double-click on "Generate" reuses it instead of enqueueing a duplicate.
 */
export function findMatchingJob(jobs, { tenantId, sectionId, termId }) {
  return (
    jobs.find(
      (job) =>
        job.data?.tenantId === tenantId &&
        job.data?.sectionId === sectionId &&
        job.data?.termId === termId
    ) ?? null
  );
}
