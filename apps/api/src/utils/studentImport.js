import { studentCreateSchemaFor } from '@rooted/shared/schemas';

// Which CSV column a schema field comes from, so a row error names the column
// the person has to fix.
const COLUMN_FOR = {
  whatsappNumber: 'whatsapp',
  whatsappSameAsPhone: 'whatsapp',
  'address.city': 'city',
  'address.pincode': 'pincode',
  'parentContacts.0.name': 'guardianName',
  'parentContacts.0.phone': 'guardianPhone',
  'parentContacts.0.relation': 'guardianRelation',
  'parentContacts.0.email': 'guardianEmail',
  'parentContacts.0.whatsappNumber': 'guardianWhatsapp',
  'parentContacts.0.whatsappSameAsPhone': 'guardianWhatsapp',
};

const cell = (value) => (value == null ? '' : String(value).trim());
const isSame = (value) => /^same$/i.test(value);

// A WhatsApp cell is a number, or the word "same" meaning the phone itself.
function whatsappFields(value) {
  if (!value) return {};
  return isSame(value) ? { whatsappSameAsPhone: true } : { whatsappNumber: value };
}

/**
 * Turns one CSV row into what Student.create takes, validated by the same schema
 * the Add Student form uses, so an import cannot store what the form would refuse.
 *
 * Columns: admissionNo, firstName, lastName (required); sectionId (a section
 * *name*, resolved by the route), rollNo (schools only), dateOfBirth, gender, email (becomes a login,
 * so it is returned apart from the fields), phone, whatsapp, admissionDate, city,
 * pincode, and guardianName / guardianPhone / guardianRelation / guardianEmail /
 * guardianWhatsapp (the older parentName / parentPhone / parentRelation work
 * too). Anything else, Aadhaar included, is ignored. Blank cells are not errors.
 *
 * Returns { ok: true, fields, email, sectionName } or { ok: false, reason }.
 */
export function mapImportRow(row, orgType) {
  const get = (...names) => {
    for (const name of names) {
      const value = cell(row[name]);
      if (value) return value;
    }
    return '';
  };

  if (!get('admissionNo') || !get('firstName') || !get('lastName')) {
    return { ok: false, reason: 'Missing required fields' };
  }

  const body = {
    admissionNo: get('admissionNo'),
    firstName: get('firstName'),
    lastName: get('lastName'),
    dateOfBirth: get('dateOfBirth'),
    gender: get('gender'),
    email: get('email'),
    phone: get('phone'),
    admissionDate: get('admissionDate'),
    ...whatsappFields(get('whatsapp')),
  };

  // Only a school's schema knows this key (it is strict), so a blank is left out.
  if (get('rollNo')) body.rollNo = get('rollNo');

  const city = get('city');
  const pincode = get('pincode');
  if (city || pincode) body.address = { city, pincode };

  const guardian = {
    name: get('guardianName', 'parentName'),
    phone: get('guardianPhone', 'parentPhone'),
    relation: get('guardianRelation', 'parentRelation'),
    email: get('guardianEmail'),
    ...whatsappFields(get('guardianWhatsapp')),
  };
  if (Object.values(guardian).some(Boolean)) {
    body.parentContacts = [
      // A number with no name is common in school registers.
      { ...guardian, name: guardian.name || 'Parent', isPrimary: true },
    ];
  }

  const result = studentCreateSchemaFor(orgType).safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.join('.');
    const column = COLUMN_FOR[path] ?? path;
    return { ok: false, reason: column ? `${column}: ${issue.message}` : issue.message };
  }

  // The schema leaves a blank cell as a key holding undefined; drop those.
  const { email, ...parsed } = result.data;
  const fields = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined));
  return { ok: true, fields, email, sectionName: get('sectionId') || undefined };
}
