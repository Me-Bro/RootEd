export class SalaryComponentError extends Error {}

/**
 * Resolves a SalaryStructure's raw components into concrete amounts.
 * Fixed components resolve to their own amount; percentage components
 * resolve against a non-percentage sibling's amount via baseRef.
 *
 * Matching is by each component's stable `id`, not its `label` — labels
 * are freely editable display text, so keying resolution off them would
 * silently orphan a percentage component whenever its base gets renamed.
 */
export function resolveComponents(components) {
  for (const comp of components) {
    if (!comp.id) {
      throw new SalaryComponentError(
        `Component "${comp.label}" is missing a stable id — this structure needs the id-backfill migration run before slips can be generated`
      );
    }
  }

  const labelById = new Map(components.map((c) => [c.id, c.label]));
  const fixedMap = {};
  const percentageIds = new Set(components.filter((c) => c.isPercentage).map((c) => c.id));

  for (const comp of components) {
    if (!comp.isPercentage) fixedMap[comp.id] = comp.amount;
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
    if (percentageIds.has(comp.baseRef)) {
      throw new SalaryComponentError(
        `Component "${comp.label}" references "${labelById.get(comp.baseRef) ?? comp.baseRef}", which is itself a percentage component — percentage-of-percentage is not supported`
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
