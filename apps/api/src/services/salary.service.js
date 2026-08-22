import { StaffMember } from '../models/StaffMember.js';
import { SalaryStructure } from '../models/SalaryStructure.js';
import { encryptField, decryptField } from '../utils/fieldEncryption.js';
import { resolveComponents, computeTotals } from '../utils/salaryCalculations.js';
import { logger } from '../utils/logger.js';

export class SalarySlipInputError extends Error {}

function decryptAmount(ciphertext, tenantId) {
  if (ciphertext == null) return 0;
  try {
    return Number(decryptField(ciphertext, tenantId));
  } catch (err) {
    // Legacy plaintext data that predates encryption (see
    // scripts/migrate-salary-encrypt-amounts.js) — degrade to "still
    // readable" instead of 500ing the request.
    logger.warn({ err }, 'Failed to decrypt salary amount, falling back to raw value');
    return Number(ciphertext);
  }
}

function encryptAmount(amount, tenantId) {
  return encryptField(String(amount), tenantId);
}

export function decryptComponents(components, tenantId) {
  return (components ?? []).map((c) => ({
    ...c,
    amount: decryptAmount(c.amount, tenantId),
  }));
}

export function encryptComponents(components, tenantId) {
  return (components ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    type: c.type,
    isPercentage: c.isPercentage,
    baseRef: c.baseRef,
    amount: encryptAmount(c.amount, tenantId),
  }));
}

export function decryptSlipTotals(slip, tenantId) {
  return {
    grossEarnings: decryptAmount(slip.grossEarnings, tenantId),
    totalDeductions: decryptAmount(slip.totalDeductions, tenantId),
    netPay: decryptAmount(slip.netPay, tenantId),
  };
}

/**
 * Decrypts a lean SalarySlip doc's amount-bearing fields for an API
 * response. Leaves everything else (status, pdfKey, timestamps, ...)
 * untouched.
 */
export function decryptSlip(slip, tenantId) {
  return {
    ...slip,
    components: decryptComponents(slip.components, tenantId),
    ...decryptSlipTotals(slip, tenantId),
  };
}

export function decryptStructure(structure, tenantId) {
  return { ...structure, components: decryptComponents(structure.components, tenantId) };
}

export async function loadStaffAndStructure(tenantId, staffId) {
  const staff = await StaffMember.findOne({ _id: staffId, tenantId }).lean();
  if (!staff) throw new SalarySlipInputError('Staff not found');
  if (!staff.salaryStructureId) {
    throw new SalarySlipInputError('Staff has no salary structure assigned');
  }

  const structure = await SalaryStructure.findOne({
    _id: staff.salaryStructureId,
    tenantId,
  }).lean();
  if (!structure) throw new SalarySlipInputError('Salary structure not found');

  return { staff, structure };
}

/**
 * Decrypts a structure's components, resolves them to concrete amounts,
 * and returns both the plaintext (for PDF rendering) and re-encrypted
 * (for persistence) shapes.
 */
export function computeSalarySlip(structure, tenantId) {
  const decryptedComponents = decryptComponents(structure.components, tenantId);
  const resolvedComponents = resolveComponents(decryptedComponents);
  const totals = computeTotals(resolvedComponents);

  return {
    plaintext: { components: resolvedComponents, ...totals },
    encrypted: {
      components: encryptComponents(resolvedComponents, tenantId),
      grossEarnings: encryptAmount(totals.grossEarnings, tenantId),
      totalDeductions: encryptAmount(totals.totalDeductions, tenantId),
      netPay: encryptAmount(totals.netPay, tenantId),
    },
  };
}
