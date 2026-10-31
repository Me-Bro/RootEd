// First thing missing before grades can be entered. Each list is undefined while it loads,
// so a slow request never flashes a "create it first" message.
export function gradesGap({ sections, terms, subjects }) {
  if (sections?.length === 0) return 'sections';
  if (terms?.length === 0) return 'terms';
  if (subjects?.length === 0) return 'subjects';
  return null;
}
