import { enquirySubmitSchema } from '@rooted/shared/schemas';

const valid = {
  contactName: 'Meena Joshi',
  collegeName: 'Khatima Degree College',
  email: 'tpo@college.test',
  phone: '+91 98765-43210',
};

describe('enquirySubmitSchema', () => {
  test('keeps only the digits (and a leading +) of the phone number', () => {
    expect(enquirySubmitSchema.parse(valid).phone).toBe('+919876543210');
    expect(enquirySubmitSchema.parse({ ...valid, phone: '(0594) 222.333' }).phone).toBe(
      '0594222333'
    );
  });

  test('defaults the programme to not_sure', () => {
    expect(enquirySubmitSchema.parse(valid).programme).toBe('not_sure');
  });

  test.each([
    ['phone too short', { phone: '12345' }],
    ['phone with letters', { phone: '98765abcde' }],
    ['bad email', { email: 'not-an-email' }],
    ['blank name', { contactName: '   ' }],
    ['blank college', { collegeName: '' }],
    ['unknown programme', { programme: 'gold' }],
    ['message too long', { message: 'x'.repeat(2001) }],
    ['unknown field', { role: 'admin' }],
  ])('rejects %s', (_label, patch) => {
    expect(enquirySubmitSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
