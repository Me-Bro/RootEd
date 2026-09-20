export const FEEDBACK_STATUS_TRANSITIONS = {
  new: ['in_progress', 'resolved'],
  in_progress: ['new', 'resolved'],
  resolved: ['in_progress'],
};

export function isValidFeedbackStatusTransition(from, to) {
  return (FEEDBACK_STATUS_TRANSITIONS[from] ?? []).includes(to);
}
