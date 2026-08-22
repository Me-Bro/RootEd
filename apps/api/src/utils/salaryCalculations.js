export class SalaryComponentError extends Error {}

/**
 * Resolves a SalaryStructure's raw components into concrete amounts.
 * Fixed components resolve to their own amount; percentage components
 * resolve against a non-percentage sibling's amount via baseRef.
 */
export function resolveComponents(components) {
  const fixedMap = {};
  const percentageLabels = new Set(components.filter((c) => c.isPercentage).map((c) => c.label));

  for (const comp of components) {
    if (!comp.isPercentage) fixedMap[comp.label] = comp.amount;
  }

  const resolved = [];
  for (const comp of components) {
    if (!comp.isPercentage) {
      resolved.push({ label: comp.label, type: comp.type, amount: comp.amount });
      continue;
    }

    if (!comp.baseRef) {
      throw new SalaryComponentError(
        `Component "${comp.label}" is a percentage component but has no baseRef`
      );
    }
    if (percentageLabels.has(comp.baseRef)) {
      throw new SalaryComponentError(
        `Component "${comp.label}" references "${comp.baseRef}", which is itself a percentage component — percentage-of-percentage is not supported`
      );
    }
    if (!(comp.baseRef in fixedMap)) {
      throw new SalaryComponentError(
        `Component "${comp.label}" references unknown base component "${comp.baseRef}"`
      );
    }

    const amount = parseFloat(((comp.amount / 100) * fixedMap[comp.baseRef]).toFixed(2));
    resolved.push({ label: comp.label, type: comp.type, amount });
  }

  return resolved;
}

export function computeTotals(resolvedComponents) {
  const grossEarnings = resolvedComponents
    .filter((c) => c.type === 'earning')
    .reduce((sum, c) => sum + c.amount, 0);
  const totalDeductions = resolvedComponents
    .filter((c) => c.type === 'deduction')
    .reduce((sum, c) => sum + c.amount, 0);

  return { grossEarnings, totalDeductions, netPay: grossEarnings - totalDeductions };
}
