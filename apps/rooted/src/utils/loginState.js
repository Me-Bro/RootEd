/**
 * How a student's login looks to an administrator. `account` is the row's
 * `account` from GET /academic/students (only sent to students:write holders):
 * null when the student has no login.
 *
 * Staff rows arrive with the state already worked out (`login`, see
 * staffLoginState in the API).
 */
export function studentLoginState(account) {
  if (!account) return 'none';
  if (account.status === 'suspended') return 'suspended';
  return account.status === 'pending_claim' ? 'pending' : 'active';
}

export const LOGIN_BADGE_VARIANT = {
  none: 'default',
  pending: 'warning',
  active: 'success',
  suspended: 'danger',
};
