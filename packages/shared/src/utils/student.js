import { isBatchOrgType } from './orgTypes.js';
import { normalizeIndianMobile } from '../schemas/studyCenter.schema.js';

// Which extra student fields an org type collects: a school, a batch-style
// center (tuition, coaching, study center) or a college. An unknown org type
// falls back to school, as the rest of the org-type helpers do.
export function studentGroupFor(orgType) {
  if (orgType === 'college') return 'college';
  return isBatchOrgType(orgType) ? 'batch' : 'school';
}

// The number to message on WhatsApp: the phone itself when the entity says
// "same as phone", else the separate WhatsApp number. Works for a student and
// for a guardian contact, which share these field names.
export function resolveWhatsapp(entity) {
  if (!entity) return null;
  if (entity.whatsappSameAsPhone) return entity.phone ?? null;
  return entity.whatsappNumber ?? null;
}

// The guardian to call first: the one flagged primary, else the first listed.
export function primaryContact(parentContacts) {
  if (!Array.isArray(parentContacts) || parentContacts.length === 0) return null;
  return parentContacts.find((c) => c?.isPrimary) ?? parentContacts[0];
}

// A wa.me link for a typed Indian mobile number, or null if it is not one.
export function waLink(number) {
  const digits = normalizeIndianMobile(number);
  return /^[6-9]\d{9}$/.test(digits) ? `https://wa.me/91${digits}` : null;
}

// Verhoeff tables (the checksum Aadhaar uses): multiplication, permutation.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

// Stored form of an Aadhaar number: bare digits (spaces and hyphens removed).
export function normalizeAadhaar(input) {
  return String(input ?? '').replace(/[\s-]/g, '');
}

// Twelve digits, first digit 2-9, and a valid Verhoeff check digit.
export function isValidAadhaar(input) {
  const digits = normalizeAadhaar(input);
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  let c = 0;
  [...digits].reverse().forEach((ch, i) => {
    c = D[c][P[i % 8][Number(ch)]];
  });
  return c === 0;
}
