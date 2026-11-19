import { shiftsOverlap } from './shiftOverlap.js';

/**
 * Pairs of active seat holds that share a seat but sit in shifts whose hours overlap:
 * what the assign rule now refuses, found in data that predates it. Pure, no DB.
 *
 * `allocations` are active holds (`seatId`, `sectionId`, `tenantId`, ...) and
 * `sectionById` maps a section id string to its `{ startTime, endTime }`. A hold whose
 * section is unknown is skipped. Two holds in the same section cannot both be active
 * (the unique index), so only different sections are compared.
 *
 * Returns `[{ first, second }]`, each pair once, in the order the holds were given.
 */
export function findOverlappingHolds(allocations, sectionById) {
  const bySeat = new Map();
  for (const hold of allocations) {
    const key = `${hold.tenantId}:${hold.seatId}`;
    if (!bySeat.has(key)) bySeat.set(key, []);
    bySeat.get(key).push(hold);
  }

  const pairs = [];
  for (const holds of bySeat.values()) {
    for (let i = 0; i < holds.length; i += 1) {
      for (let j = i + 1; j < holds.length; j += 1) {
        const [first, second] = [holds[i], holds[j]];
        if (String(first.sectionId) === String(second.sectionId)) continue;
        const a = sectionById.get(String(first.sectionId));
        const b = sectionById.get(String(second.sectionId));
        if (a && b && shiftsOverlap(a, b)) pairs.push({ first, second });
      }
    }
  }
  return pairs;
}
