import { STUDENT_CATEGORIES } from '@rooted/shared/schemas';
import { studentGroupFor } from '@rooted/shared/utils';

// The extra student fields an org type collects, in the order they are shown.
// The keys match the API's per-org-type schema (studentFieldsFor in
// @rooted/shared), which rejects a field outside the tenant's group.
export const GROUP_FIELDS = {
  school: [
    { key: 'rollNo' },
    { key: 'previousSchool' },
    { key: 'tcNumber' },
    { key: 'motherTongue' },
    { key: 'nationality' },
    { key: 'transportRoute' },
    { key: 'transportStop' },
    { key: 'category', options: STUDENT_CATEGORIES },
  ],
  batch: [{ key: 'examTarget' }, { key: 'joiningSource' }],
  college: [
    { key: 'college' },
    { key: 'branch' },
    { key: 'graduationYear', type: 'number' },
    { key: 'skills', list: true },
  ],
};

export const groupFieldsFor = (orgType) => GROUP_FIELDS[studentGroupFor(orgType)];

export const emptyContact = () => ({
  name: '',
  relation: '',
  phone: '',
  email: '',
  whatsappNumber: '',
  whatsappSameAsPhone: false,
  isPrimary: false,
  isEmergency: false,
});

const day = (value) => (value ? String(value).slice(0, 10) : '');
const text = (value) => (value == null ? '' : String(value));

// Form state for a student, or for a blank new one when `student` is omitted.
// Everything is a string (or boolean) so inputs stay controlled.
export function formFromStudent(student = {}, orgType) {
  const form = {
    admissionNo: text(student.admissionNo),
    firstName: text(student.firstName),
    lastName: text(student.lastName),
    sectionId: text(student.sectionId),
    dateOfBirth: day(student.dateOfBirth),
    gender: text(student.gender),
    email: '',
    phone: text(student.phone),
    whatsappNumber: text(student.whatsappNumber),
    whatsappSameAsPhone: Boolean(student.whatsappSameAsPhone),
    admissionDate: day(student.admissionDate),
    address: {
      line1: text(student.address?.line1),
      line2: text(student.address?.line2),
      city: text(student.address?.city),
      state: text(student.address?.state),
      pincode: text(student.address?.pincode),
    },
    bloodGroup: text(student.bloodGroup),
    allergies: text(student.allergies),
    medicalNotes: text(student.medicalNotes),
    aadhaar: '',
    removeAadhaar: false,
    // Rebuilt key by key, so the Mongo _id a saved guardian carries is dropped.
    parentContacts: (student.parentContacts ?? []).map((c) => ({
      ...emptyContact(),
      name: text(c.name),
      relation: text(c.relation),
      phone: text(c.phone),
      email: text(c.email),
      whatsappNumber: text(c.whatsappNumber),
      whatsappSameAsPhone: Boolean(c.whatsappSameAsPhone),
      isPrimary: Boolean(c.isPrimary),
      isEmergency: Boolean(c.isEmergency),
    })),
  };
  for (const field of groupFieldsFor(orgType)) {
    form[field.key] = field.list ? (student[field.key] ?? []).join(', ') : text(student[field.key]);
  }
  return form;
}

const isBlankContact = (c) =>
  !(c.name || c.relation || c.phone || c.email || c.whatsappNumber).trim();

// The request body for POST (mode 'create') or PATCH (mode 'update').
//
// On create a blank field is left out. On update it is sent as '', which is how
// the API is told to clear what was saved. A guardian row left empty is dropped,
// and the Aadhaar number is sent only when typed (or '' when "remove" is ticked),
// because the saved number is never sent back to the browser.
export function studentPayload(form, { mode, orgType }) {
  const create = mode === 'create';
  const payload = {};
  const put = (key, value) => {
    if (create && (value === '' || value === undefined)) return;
    payload[key] = typeof value === 'string' ? value.trim() : value;
  };

  for (const key of [
    'firstName',
    'lastName',
    'sectionId',
    'dateOfBirth',
    'gender',
    'phone',
    'admissionDate',
    'bloodGroup',
    'allergies',
    'medicalNotes',
  ]) {
    put(key, form[key]);
  }
  // "Same as phone" makes a separate number meaningless, so it is cleared.
  put('whatsappNumber', form.whatsappSameAsPhone ? '' : form.whatsappNumber);
  if (form.whatsappSameAsPhone || !create) payload.whatsappSameAsPhone = form.whatsappSameAsPhone;

  if (create) {
    put('admissionNo', form.admissionNo);
    put('email', form.email);
  }

  const address = Object.fromEntries(
    Object.entries(form.address).map(([key, value]) => [key, value.trim()])
  );
  if (!create || Object.values(address).some(Boolean)) payload.address = address;

  const contacts = form.parentContacts
    .filter((c) => !isBlankContact(c))
    .map((c) => ({
      name: c.name.trim(),
      relation: c.relation.trim(),
      phone: c.phone.trim(),
      email: c.email.trim(),
      whatsappNumber: c.whatsappSameAsPhone ? '' : c.whatsappNumber.trim(),
      whatsappSameAsPhone: c.whatsappSameAsPhone,
      isPrimary: c.isPrimary,
      isEmergency: c.isEmergency,
    }));
  if (!create || contacts.length > 0) payload.parentContacts = contacts;

  if (form.removeAadhaar) payload.aadhaar = '';
  else if (form.aadhaar.trim()) payload.aadhaar = form.aadhaar.trim();

  for (const field of groupFieldsFor(orgType)) {
    if (field.list) {
      const list = form[field.key]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (!create || list.length > 0) payload[field.key] = list;
    } else {
      put(field.key, form[field.key]);
    }
  }
  return payload;
}
