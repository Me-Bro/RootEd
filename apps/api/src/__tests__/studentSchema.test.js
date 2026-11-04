import {
  studentCreateSchemaFor,
  studentUpdateSchemaFor,
  studentFieldsFor,
} from '@rooted/shared/schemas';
import {
  isValidAadhaar,
  resolveWhatsapp,
  primaryContact,
  waLink,
  studentGroupFor,
} from '@rooted/shared/utils';

const create = (orgType = 'school') => studentCreateSchemaFor(orgType);
const update = (orgType = 'school') => studentUpdateSchemaFor(orgType);
const base = { admissionNo: 'A-1', firstName: 'Asha', lastName: 'Rao' };
const issue = (result) => result.error.issues[0].message;

// Verhoeff-valid, first digit 2-9, twelve digits.
const AADHAAR = '234567890124';

describe('student create schema', () => {
  test('needs admissionNo, firstName and lastName', () => {
    expect(create().safeParse(base).success).toBe(true);
    for (const key of Object.keys(base)) {
      const rest = Object.fromEntries(Object.entries(base).filter(([k]) => k !== key));
      expect(create().safeParse(rest).success).toBe(false);
    }
  });

  test('rejects keys a caller must never set', () => {
    for (const key of ['userId', 'tenantId', 'kind', 'placementConsent', 'photoKey', 'bogus']) {
      expect(create().safeParse({ ...base, [key]: 'x' }).success).toBe(false);
    }
  });

  test('does not accept status or statusReason (a new student is active)', () => {
    expect(create().safeParse({ ...base, status: 'withdrawn' }).success).toBe(false);
    expect(create().safeParse({ ...base, statusReason: 'moved' }).success).toBe(false);
  });

  test('normalizes phone, whatsappNumber and guardian phones', () => {
    const out = create().parse({
      ...base,
      phone: '+91 98765-43210',
      whatsappNumber: '098765 43211',
      parentContacts: [{ name: 'Ravi', phone: ' 9876543212 ' }],
    });
    expect(out.phone).toBe('9876543210');
    expect(out.whatsappNumber).toBe('9876543211');
    expect(out.parentContacts[0].phone).toBe('9876543212');
  });

  test('a bad phone fails with the mobile-number message', () => {
    const result = create().safeParse({ ...base, phone: '12345' });
    expect(result.success).toBe(false);
    expect(issue(result)).toBe('Enter a valid 10-digit mobile number');
  });

  test('blank optional fields from a form are dropped, not validated', () => {
    const out = create().parse({
      ...base,
      phone: '',
      email: '',
      dateOfBirth: '',
      gender: '',
      sectionId: '',
      bloodGroup: '',
      aadhaar: '',
    });
    expect(out).toEqual(base);
  });

  test('lowercases and checks the student email', () => {
    expect(create().parse({ ...base, email: ' Asha@Example.COM ' }).email).toBe('asha@example.com');
    expect(create().safeParse({ ...base, email: 'nope' }).success).toBe(false);
  });

  test('whatsappSameAsPhone needs a phone to point at', () => {
    expect(create().safeParse({ ...base, whatsappSameAsPhone: true }).success).toBe(false);
    expect(
      create().safeParse({ ...base, whatsappSameAsPhone: true, phone: '9876543210' }).success
    ).toBe(true);
  });

  test('address pincode is six digits and cannot start with 0', () => {
    const address = { line1: '1 Main Rd', city: 'Pune', state: 'MH' };
    expect(
      create().safeParse({ ...base, address: { ...address, pincode: '411001' } }).success
    ).toBe(true);
    for (const pincode of ['41100', '011001', '4110011', 'abcdef']) {
      expect(create().safeParse({ ...base, address: { ...address, pincode } }).success).toBe(false);
    }
  });

  test('blood group is an enum', () => {
    expect(create().safeParse({ ...base, bloodGroup: 'O+' }).success).toBe(true);
    expect(create().safeParse({ ...base, bloodGroup: 'Z+' }).success).toBe(false);
  });

  test('admission date and date of birth cannot be in the future', () => {
    expect(create().safeParse({ ...base, admissionDate: '2020-04-01' }).success).toBe(true);
    expect(create().safeParse({ ...base, admissionDate: '2999-01-01' }).success).toBe(false);
    expect(create().safeParse({ ...base, dateOfBirth: '2999-01-01' }).success).toBe(false);
    expect(create().safeParse({ ...base, dateOfBirth: 'not-a-date' }).success).toBe(false);
  });

  test('aadhaar: valid number is stored as bare digits, bad checksum is rejected', () => {
    expect(create().parse({ ...base, aadhaar: '2345 6789-0124' }).aadhaar).toBe(AADHAAR);
    const bad = create().safeParse({ ...base, aadhaar: '234567890125' });
    expect(bad.success).toBe(false);
    expect(issue(bad)).toBe('Enter a valid 12-digit Aadhaar number');
  });
});

describe('guardian contacts', () => {
  const contacts = (parentContacts) => create().safeParse({ ...base, parentContacts });

  test('a contact needs a name and a way to reach them', () => {
    expect(contacts([{ name: 'Ravi', phone: '9876543210' }]).success).toBe(true);
    expect(contacts([{ name: 'Ravi', email: 'Ravi@Example.com' }]).success).toBe(true);
    expect(contacts([{ name: 'Ravi' }]).success).toBe(false);
    expect(contacts([{ phone: '9876543210' }]).success).toBe(false);
  });

  test('at most one primary guardian', () => {
    const two = [
      { name: 'A', phone: '9876543210', isPrimary: true },
      { name: 'B', phone: '9876543211', isPrimary: true },
    ];
    expect(contacts(two).success).toBe(false);
    expect(contacts([two[0], { ...two[1], isPrimary: false }]).success).toBe(true);
    expect(
      contacts([
        { ...two[0], isPrimary: false },
        { ...two[1], isPrimary: false },
      ]).success
    ).toBe(true);
  });

  test('a contact may be primary and emergency at once', () => {
    const out = contacts([{ name: 'A', phone: '9876543210', isPrimary: true, isEmergency: true }]);
    expect(out.success).toBe(true);
    expect(out.data.parentContacts[0]).toMatchObject({ isPrimary: true, isEmergency: true });
  });

  test("a contact's whatsappSameAsPhone needs that contact's phone", () => {
    expect(contacts([{ name: 'A', email: 'a@b.co', whatsappSameAsPhone: true }]).success).toBe(
      false
    );
    expect(contacts([{ name: 'A', phone: '9876543210', whatsappSameAsPhone: true }]).success).toBe(
      true
    );
  });

  test('no more than five contacts', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ name: `G${i}`, phone: '9876543210' }));
    expect(contacts(six).success).toBe(false);
  });

  test('a contact read back from the API (with its _id) can be sent again; the id is dropped', () => {
    const out = contacts([{ _id: '66a1b2c3d4e5f60718293a4b', name: 'A', phone: '9876543210' }]);
    expect(out.success).toBe(true);
    expect(out.data.parentContacts[0]).toEqual({ name: 'A', phone: '9876543210' });
  });

  test('unknown keys on a contact are rejected', () => {
    expect(contacts([{ name: 'A', phone: '9876543210', role: 'admin' }]).success).toBe(false);
  });
});

describe('student update schema', () => {
  test('every field is optional, so an empty patch is valid', () => {
    expect(update().safeParse({}).success).toBe(true);
  });

  test('rejects identity and ownership fields', () => {
    for (const key of [
      'userId',
      'tenantId',
      'admissionNo',
      'kind',
      'placementConsent',
      'email',
      'aadhaarEnc',
      'aadhaarLast4',
      'statusChangedAt',
    ]) {
      expect(update().safeParse({ [key]: 'x' }).success).toBe(false);
    }
  });

  test('accepts status and statusReason', () => {
    const out = update().parse({ status: 'withdrawn', statusReason: 'Moved city' });
    expect(out).toEqual({ status: 'withdrawn', statusReason: 'Moved city' });
    expect(update().safeParse({ status: 'deleted' }).success).toBe(false);
  });

  test('a blank phone is kept as a blank so the route can clear it', () => {
    expect(update().parse({ phone: '' })).toEqual({ phone: '' });
    expect(update().parse({ phone: '98765 43210' })).toEqual({ phone: '9876543210' });
    expect(update().safeParse({ phone: '123' }).success).toBe(false);
  });

  test('a blank aadhaar is kept as a blank so the route can clear it', () => {
    expect(update().parse({ aadhaar: '' })).toEqual({ aadhaar: '' });
    expect(update().parse({ aadhaar: AADHAAR })).toEqual({ aadhaar: AADHAAR });
  });

  test('applies the same contact rules as create', () => {
    expect(update().safeParse({ parentContacts: [{ name: 'A' }] }).success).toBe(false);
    expect(update().safeParse({ parentContacts: [] }).success).toBe(true);
  });
});

describe('org-type field groups', () => {
  const school = { previousSchool: 'St Mary', category: 'obc', transportRoute: 'R4' };
  const batch = { examTarget: 'NEET', joiningSource: 'Referral' };
  const college = {
    college: 'ABC Institute',
    branch: 'CSE',
    graduationYear: 2027,
    skills: ['SQL'],
  };

  test('a school accepts school fields and rejects batch and college fields', () => {
    expect(create('school').safeParse({ ...base, ...school }).success).toBe(true);
    expect(create('school').safeParse({ ...base, ...batch }).success).toBe(false);
    expect(create('school').safeParse({ ...base, ...college }).success).toBe(false);
  });

  test('coaching, tuition and study centers accept batch fields only', () => {
    for (const orgType of ['coaching_center', 'tuition_center', 'study_center']) {
      expect(create(orgType).safeParse({ ...base, ...batch }).success).toBe(true);
      expect(create(orgType).safeParse({ ...base, ...school }).success).toBe(false);
    }
  });

  test('a college accepts college fields only', () => {
    expect(create('college').safeParse({ ...base, ...college }).success).toBe(true);
    expect(create('college').safeParse({ ...base, ...batch }).success).toBe(false);
  });

  test('category is an enum; graduation year is bounded', () => {
    expect(create('school').safeParse({ ...base, category: 'martian' }).success).toBe(false);
    expect(create('college').safeParse({ ...base, graduationYear: 1800 }).success).toBe(false);
  });

  test('the update schema applies the same grouping', () => {
    expect(update('school').safeParse(school).success).toBe(true);
    expect(update('school').safeParse(batch).success).toBe(false);
  });

  test('an unknown org type falls back to the school group', () => {
    expect(create('mystery').safeParse({ ...base, ...school }).success).toBe(true);
    expect(studentGroupFor('mystery')).toBe('school');
    expect(studentGroupFor(undefined)).toBe('school');
  });

  test('studentGroupFor and studentFieldsFor name the group and its fields', () => {
    expect(studentGroupFor('school')).toBe('school');
    expect(studentGroupFor('college')).toBe('college');
    for (const orgType of ['coaching_center', 'tuition_center', 'study_center']) {
      expect(studentGroupFor(orgType)).toBe('batch');
    }
    expect(studentFieldsFor('school')).toEqual(expect.arrayContaining(['category', 'tcNumber']));
    expect(studentFieldsFor('study_center')).toEqual(['examTarget', 'joiningSource']);
    expect(studentFieldsFor('college')).toEqual(
      expect.arrayContaining(['college', 'branch', 'graduationYear', 'skills'])
    );
  });
});

describe('resolveWhatsapp', () => {
  test('uses the phone when the flag is on', () => {
    expect(
      resolveWhatsapp({
        phone: '9876543210',
        whatsappNumber: '9876543211',
        whatsappSameAsPhone: true,
      })
    ).toBe('9876543210');
  });

  test('otherwise uses whatsappNumber, else null', () => {
    expect(resolveWhatsapp({ phone: '9876543210', whatsappNumber: '9876543211' })).toBe(
      '9876543211'
    );
    expect(resolveWhatsapp({ phone: '9876543210' })).toBeNull();
    expect(resolveWhatsapp({ whatsappSameAsPhone: true })).toBeNull();
    expect(resolveWhatsapp(null)).toBeNull();
  });
});

describe('primaryContact', () => {
  const a = { name: 'A', phone: '9876543210' };
  const b = { name: 'B', phone: '9876543211', isPrimary: true };

  test('picks the primary, else the first, else null', () => {
    expect(primaryContact([a, b])).toBe(b);
    expect(primaryContact([a, { ...b, isPrimary: false }])).toBe(a);
    expect(primaryContact([])).toBeNull();
    expect(primaryContact(undefined)).toBeNull();
  });
});

describe('waLink', () => {
  test('builds a wa.me link from a typed Indian mobile', () => {
    expect(waLink('98765 43210')).toBe('https://wa.me/919876543210');
    expect(waLink('+91 9876543210')).toBe('https://wa.me/919876543210');
  });

  test('returns null for anything that is not a mobile number', () => {
    for (const bad of [undefined, null, '', '12345', '5876543210']) {
      expect(waLink(bad)).toBeNull();
    }
  });
});

describe('isValidAadhaar', () => {
  test('accepts a twelve-digit Verhoeff-valid number, with or without separators', () => {
    expect(isValidAadhaar(AADHAAR)).toBe(true);
    expect(isValidAadhaar('9876 5432 1012')).toBe(true);
    expect(isValidAadhaar('9876-5432-1012')).toBe(true);
  });

  test('rejects a bad checksum, wrong length, a leading 0 or 1, and non-digits', () => {
    expect(isValidAadhaar('234567890125')).toBe(false);
    expect(isValidAadhaar('23456789012')).toBe(false);
    expect(isValidAadhaar('2345678901245')).toBe(false);
    // Right checksum, wrong first digit.
    expect(isValidAadhaar('045678901242')).toBe(false);
    expect(isValidAadhaar('145678901243')).toBe(false);
    expect(isValidAadhaar('23456789012x')).toBe(false);
    expect(isValidAadhaar(undefined)).toBe(false);
  });
});
