export function calculateMandatoryTotal(components) {
  return components.reduce((sum, c) => (c.isOptional ? sum : sum + c.amount), 0);
}

export function calculateEffectiveTotal(assignment) {
  return (
    (assignment.totalAmount || 0) -
    (assignment.discountAmount || 0) +
    (assignment.lateFeeAmount || 0)
  );
}

export function installmentsMatchTotal(installments, components) {
  const installmentTotal = installments.reduce((sum, i) => sum + i.amount, 0);
  return installmentTotal === calculateMandatoryTotal(components);
}

export function calculateLateFeeAmount({ type, value, baseAmount }) {
  if (type === 'percentage') return Math.round((baseAmount * value) / 100);
  return value; // flat
}

export function scaleComponents(components, adjustmentPercent = 0) {
  const factor = 1 + adjustmentPercent / 100;
  return components.map((c) => ({ ...c, amount: Math.round(c.amount * factor) }));
}

export function calculateDiscountAmount({ type, value, baseAmount }) {
  if (type === 'percentage') return Math.round((baseAmount * value) / 100);
  return Math.min(value, baseAmount); // flat, capped so effective total can't go negative
}

export function calculateRemainingDue({ assignment, totalPaid, installmentIndex }) {
  if (installmentIndex !== undefined && installmentIndex !== null) {
    const inst = assignment.installments?.[installmentIndex];
    if (inst) return inst.amount - inst.paidAmount;
  }
  return calculateEffectiveTotal(assignment) - totalPaid;
}

export function recomputeFeeStatus({ assignment, payments }) {
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  const installments = assignment.installments?.length
    ? assignment.installments.map((inst, idx) => {
        const paidAmount = payments
          .filter((p) => p.installmentIndex === idx)
          .reduce((sum, p) => sum + p.amount, 0);
        return {
          ...inst,
          paidAmount,
          status: paidAmount >= inst.amount ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
        };
      })
    : assignment.installments;

  const effectiveTotal = calculateEffectiveTotal(assignment);
  const status = totalPaid <= 0 ? 'unpaid' : totalPaid >= effectiveTotal ? 'paid' : 'partial';

  return { installments, status };
}

export function canWaiveAssignment(status) {
  return status === 'unpaid' || status === 'partial';
}

export function discountAppliesTo({ discount, assignment, studentClassId }) {
  if (discount.applicableTo === 'all') return true;
  if (discount.applicableTo === 'student') {
    return String(discount.studentId) === String(assignment.studentId);
  }
  if (discount.applicableTo === 'class') {
    return studentClassId != null && String(discount.classId) === String(studentClassId);
  }
  return false;
}
