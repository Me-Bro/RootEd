// Where a link to a learner's page came from, so its back link can return there instead
// of the roster. The origin travels as router state; only the names below are honoured,
// so a crafted state can never send the back link somewhere else.
const ORIGINS = {
  desk: { path: '/desk', labelKey: 'studyCenter.desk.backToDesk' },
  fees: { path: '/fee', labelKey: 'fee.collection.backToFees' },
  pending: { path: '/fee/pending', labelKey: 'pendingFees.backToPending' },
};

/** `to` and `state` for a <Link>/navigate() to a learner's page. `tab` opens that tab. */
export function studentLink(id, { from, tab } = {}) {
  const query = tab ? `?tab=${encodeURIComponent(tab)}` : '';
  return {
    to: `/academic/students/${id}${query}`,
    state: from in ORIGINS ? { from } : undefined,
  };
}

/** The back link for a learner's page: where the viewer came from, else the roster. */
export function studentBack(state, fallback) {
  const origin = ORIGINS[state?.from];
  return origin
    ? { to: origin.path, labelKey: origin.labelKey }
    : { to: fallback.path, labelKey: fallback.labelKey };
}
