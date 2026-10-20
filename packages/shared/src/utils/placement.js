// The placement pipeline's progression, in order. rejected/withdrawn close an
// application without a joining; `joined` and the two closing stages are
// terminal. Shared so the API enforces the rule and the portal offers only the
// moves the API will accept.
const PROGRESSION = ['applied', 'interviewed', 'offered', 'joined'];
const CLOSING = ['rejected', 'withdrawn'];

/**
 * A stage may only move forward (skipping steps is fine: an offer can follow a
 * walk-in), or to rejected/withdrawn from a stage that is not yet closed.
 */
export function nextStageAllowed(current, next) {
  const from = PROGRESSION.indexOf(current);
  if (from === -1) return false; // unknown, or already rejected/withdrawn
  if (current === 'joined') return false;
  if (CLOSING.includes(next)) return true;
  return PROGRESSION.indexOf(next) > from;
}

/** The stages an application at `current` may move to, in pipeline order. */
export function allowedNextStages(current) {
  return [...PROGRESSION, ...CLOSING].filter((stage) => nextStageAllowed(current, stage));
}
