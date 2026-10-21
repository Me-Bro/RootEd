/**
 * Roadmap progress figures. Pure: callers pass items as `{ _id, type }` and the
 * ids a student has completed. A roadmap is self-reported, so these never feed
 * the trainer-recorded metrics or readiness.
 */
import { ROADMAP_ITEM_TYPES } from '@rooted/shared/constants';

const round1 = (n) => Math.round(n * 10) / 10;

/** Percent complete, or `null` when there is nothing to complete — never 0. */
export const pctOf = (completed, total) => (total > 0 ? round1((completed / total) * 100) : null);

/**
 * Completed / total over `items`, overall and per type. Closed (locked) items
 * count in the total: finishing everything open is not finishing the roadmap.
 */
export function studentProgress(items, completedIds) {
  const done = new Set([...completedIds].map(String));
  const byType = Object.fromEntries(ROADMAP_ITEM_TYPES.map((t) => [t, { completed: 0, total: 0 }]));
  let completed = 0;
  for (const item of items) {
    const isDone = done.has(String(item._id));
    if (isDone) completed += 1;
    const bucket = byType[item.type];
    if (bucket) {
      bucket.total += 1;
      if (isDone) bucket.completed += 1;
    }
  }
  return { completed, total: items.length, pct: pctOf(completed, items.length), byType };
}

/**
 * Orders rows (`{ displayName, completed, ... }`) by completed items, then by
 * name, and adds a competition rank: equal counts share a rank and the next
 * rank skips (1, 2, 2, 4).
 */
export function rankStudents(rows) {
  const sorted = [...rows].sort(
    (a, b) => b.completed - a.completed || a.displayName.localeCompare(b.displayName)
  );
  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || row.completed !== sorted[index - 1].completed) rank = index + 1;
    return { ...row, rank };
  });
}
