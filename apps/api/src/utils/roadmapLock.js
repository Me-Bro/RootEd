/**
 * Lock rules for a roadmap. Pure: callers pass items as
 * `{ _id, locked, unlockAfter: [id] }` and completed ids from RoadmapProgress.
 */

/** Ids of an item's prerequisites that are not completed yet (strings). */
export function unmetPrerequisites(item, completedIds) {
  const done = new Set([...completedIds].map(String));
  return (item.unlockAfter ?? []).map(String).filter((id) => !done.has(id));
}

/**
 * Is the item open to the student? An unlocked item always is. A locked item
 * with prerequisites opens once all are completed; a locked item with none is a
 * mentor's hold and stays closed.
 */
export function isOpen(item, completedIds) {
  if (!item.locked) return true;
  if (!item.unlockAfter?.length) return false;
  return unmetPrerequisites(item, completedIds).length === 0;
}

/** Set of ids (strings) of the items a student can work on right now. */
export function openItemIds(items, completedIds) {
  return new Set(items.filter((i) => isOpen(i, completedIds)).map((i) => String(i._id)));
}

/**
 * True if the prerequisites loop back on themselves, including an item that
 * lists itself. An unlock chain that loops could never be opened.
 */
export function hasCycle(items) {
  const next = new Map(items.map((i) => [String(i._id), (i.unlockAfter ?? []).map(String)]));
  const state = new Map(); // id -> 'visiting' | 'done'
  const visit = (id) => {
    if (state.get(id) === 'done') return false;
    if (state.get(id) === 'visiting') return true;
    state.set(id, 'visiting');
    for (const dep of next.get(id) ?? []) if (visit(dep)) return true;
    state.set(id, 'done');
    return false;
  };
  return [...next.keys()].some(visit);
}
