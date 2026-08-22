const MAX_COMPONENTS = 5;

export function parseFeeStructureImportRow(row) {
  const { name, academicYearId, dueDate } = row;
  if (!name || !academicYearId) {
    throw new Error('Missing required fields: name, academicYearId');
  }

  const components = [];
  for (let i = 1; i <= MAX_COMPONENTS; i++) {
    const label = row[`component${i}Label`];
    const amount = row[`component${i}Amount`];
    if (!label && !amount) continue;
    if (!label || amount === undefined || amount === '') {
      throw new Error(`component${i}Label and component${i}Amount must both be present`);
    }
    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error(`component${i}Amount must be a positive number`);
    }
    components.push({ label, amount: parsedAmount, isOptional: false });
  }
  if (components.length === 0) {
    throw new Error('At least one component (component1Label/component1Amount) is required');
  }

  return {
    name,
    academicYearId,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    components,
  };
}
