import { calculateDiscountAmount } from './feeCalculations.js';

/**
 * May this caller apply a catalog discount at the desk? The tenant's
 * discountPolicy decides who, and the owner (tenant:admin) always may:
 *   staff - anyone who manages fees (fees:write), as before this setting existed
 *   desk  - anyone who takes payments (fees:collect)
 *   owner - only an administrator
 * `can` holds the caller's three relevant permissions as booleans.
 */
export function canApplyAdHocDiscount(policy, can) {
  if (can.admin) return true;
  if (policy === 'staff') return Boolean(can.feesWrite);
  if (policy === 'desk') return Boolean(can.feesCollect);
  return false;
}

export function isWithinWindow(discount, at) {
  const time = at.getTime();
  if (discount.validFrom && new Date(discount.validFrom).getTime() > time) return false;
  if (discount.validTo && new Date(discount.validTo).getTime() < time) return false;
  return true;
}

/**
 * The learner's own standing discount, if one is valid at `at`. Only one discount
 * applies to an assignment, so with several the largest in money wins.
 */
export function pickStandingDiscount({ discounts, studentId, at, baseAmount }) {
  const valid = discounts.filter(
    (d) =>
      d.applicableTo === 'student' &&
      String(d.studentId) === String(studentId) &&
      isWithinWindow(d, at)
  );
  let best = null;
  let bestAmount = -1;
  for (const d of valid) {
    const amount = calculateDiscountAmount({ type: d.type, value: d.value, baseAmount });
    if (amount > bestAmount) {
      best = d;
      bestAmount = amount;
    }
  }
  return best;
}
