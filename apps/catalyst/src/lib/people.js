/**
 * How a person's login looks to an administrator. Pure, so the two people pages
 * and their tests agree.
 *
 * `none` only applies to a student (staff always have an account); `pending` is
 * an account whose owner has not yet chosen a password.
 */
export const BADGE_VARIANT = {
  none: 'default',
  pending: 'warning',
  active: 'success',
  suspended: 'danger',
};

/** From a student row's `account` (GET /academic/students, administrators only). */
export function studentLoginState(account) {
  if (!account) return 'none';
  if (account.status === 'suspended') return 'suspended';
  return account.status === 'pending_claim' ? 'pending' : 'active';
}

/** From a TenantMembership row with its user populated (GET /tenant/members). */
export function memberLoginState(member) {
  if (member.status === 'suspended') return 'suspended';
  return member.userId?.status === 'pending_claim' ? 'pending' : 'active';
}

export const memberName = (member) =>
  `${member.userId?.firstName ?? ''} ${member.userId?.lastName ?? ''}`.trim() ||
  member.userId?.email ||
  '';
