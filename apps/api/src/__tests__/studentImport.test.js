import { mapImportRow } from '../utils/studentImport.js';

const base = { admissionNo: 'I-1', firstName: 'Asha', lastName: 'Rao' };
const map = (row, orgType = 'school') => mapImportRow({ ...base, ...row }, orgType);

describe('mapImportRow', () => {
  test('a row with only the original columns maps as before', () => {
    const out = map({ gender: 'female', dateOfBirth: '2015-06-15', sectionId: 'A' });
    expect(out.ok).toBe(true);
    expect(out.fields).toEqual({
      ...base,
      gender: 'female',
      dateOfBirth: '2015-06-15',
    });
    // The section is a name the route resolves, not an id.
    expect(out.sectionName).toBe('A');
    expect(out.email).toBeUndefined();
  });

  test('rollNo column maps for a school; blank is ignored; other org types reject it', () => {
    expect(map({ rollNo: '12' }).fields.rollNo).toBe('12');
    expect(map({ rollNo: '' }).fields).not.toHaveProperty('rollNo');
    expect(map({ rollNo: '' }, 'college').ok).toBe(true);
    expect(map({ rollNo: '12' }, 'college').ok).toBe(false);
  });

  test('requires admissionNo, firstName and lastName', () => {
    for (const key of Object.keys(base)) {
      const out = mapImportRow({ ...base, [key]: '' }, 'school');
      expect(out).toEqual({ ok: false, reason: 'Missing required fields' });
    }
  });

  test('maps phone, whatsapp, admission date, city and pincode; blank cells are ignored', () => {
    const out = map({
      phone: '+91 98765 43210',
      whatsapp: '09876543211',
      admissionDate: '2024-04-01',
      city: 'Pune',
      pincode: '411001',
      gender: '',
      dateOfBirth: '',
    });
    expect(out.ok).toBe(true);
    expect(out.fields).toMatchObject({
      phone: '9876543210',
      whatsappNumber: '9876543211',
      admissionDate: '2024-04-01',
      address: { city: 'Pune', pincode: '411001' },
    });
    expect(out.fields).not.toHaveProperty('gender');
    expect(out.fields).not.toHaveProperty('dateOfBirth');
  });

  test('no address columns means no address object', () => {
    expect(map({ city: '', pincode: '' }).fields).not.toHaveProperty('address');
  });

  test('a whatsapp cell of "same" follows the phone', () => {
    const out = map({ phone: '9876543210', whatsapp: 'Same' });
    expect(out.fields).toMatchObject({ phone: '9876543210', whatsappSameAsPhone: true });
    expect(out.fields).not.toHaveProperty('whatsappNumber');
    expect(map({ whatsapp: 'same' })).toMatchObject({
      ok: false,
      reason: 'whatsapp: Add a phone number first',
    });
  });

  test('guardian columns become the primary guardian', () => {
    const out = map({
      guardianName: 'Ravi Rao',
      guardianPhone: '9876543212',
      guardianRelation: 'father',
      guardianEmail: 'Ravi@Example.com',
      guardianWhatsapp: '9876543299',
    });
    expect(out.fields.parentContacts).toEqual([
      {
        name: 'Ravi Rao',
        phone: '9876543212',
        relation: 'father',
        email: 'ravi@example.com',
        whatsappNumber: '9876543299',
        isPrimary: true,
      },
    ]);
  });

  test('the older parentName / parentPhone / parentRelation columns work too', () => {
    const out = map({ parentName: 'Jane', parentPhone: '9876543210', parentRelation: 'mother' });
    expect(out.fields.parentContacts).toEqual([
      { name: 'Jane', phone: '9876543210', relation: 'mother', isPrimary: true },
    ]);
  });

  test('a guardian number without a name is kept under the name "Parent"', () => {
    expect(map({ guardianPhone: '9876543210' }).fields.parentContacts[0]).toMatchObject({
      name: 'Parent',
      phone: '9876543210',
    });
  });

  test('a bad number is reported against its column, and nothing is mapped', () => {
    expect(map({ phone: '123' })).toEqual({
      ok: false,
      reason: 'phone: Enter a valid 10-digit mobile number',
    });
    expect(map({ whatsapp: '123' }).reason).toMatch(/^whatsapp: /);
    expect(map({ guardianName: 'A', guardianPhone: '123' }).reason).toMatch(/^guardianPhone: /);
    expect(map({ pincode: '12' }).reason).toMatch(/^pincode: /);
    expect(map({ admissionDate: '2999-01-01' }).reason).toMatch(/^admissionDate: /);
    expect(map({ gender: 'robot' }).reason).toMatch(/^gender: /);
    expect(map({ dateOfBirth: 'soon' }).reason).toMatch(/^dateOfBirth: /);
  });

  test('keeps the email for the route to turn into a login, lowercased', () => {
    const out = map({ email: ' Asha@Example.COM ' });
    expect(out.ok).toBe(true);
    expect(out.email).toBe('asha@example.com');
    expect(out.fields).not.toHaveProperty('email');
  });

  test('a bad email is a row error', () => {
    expect(map({ email: 'nope' }).reason).toMatch(/^email: /);
  });

  test('unknown columns are ignored', () => {
    expect(map({ favouriteColour: 'blue', aadhaar: '234567890124' }).fields).toEqual(base);
  });
});
