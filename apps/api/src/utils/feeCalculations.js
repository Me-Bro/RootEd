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
