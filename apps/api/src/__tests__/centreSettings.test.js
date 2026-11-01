import { centreSettingsSchema, indianMobileSchema, walkInSchema } from '@rooted/shared/schemas';
import { resolveCentreSettings } from '../utils/centreSettings.js';

describe('resolveCentreSettings', () => {
  test('a study center defaults to owner-only discounts and 06:00-22:00', () => {
    expect(resolveCentreSettings({ orgType: 'study_center' })).toEqual({
      openTime: '06:00',
      closeTime: '22:00',
      open24h: false,
      discountPolicy: 'owner',
    });
  });

  test('every other org type keeps the staff discount rule', () => {
    for (const orgType of ['school', 'college', 'tuition_center', 'coaching_center', undefined]) {
      expect(resolveCentreSettings({ orgType }).discountPolicy).toBe('staff');
    }
  });

  test('saved values win over the defaults, key by key', () => {
    const tenant = {
      orgType: 'study_center',
      settings: { centre: { closeTime: '23:30', discountPolicy: 'desk' } },
    };
    expect(resolveCentreSettings(tenant)).toEqual({
      openTime: '06:00',
      closeTime: '23:30',
      open24h: false,
      discountPolicy: 'desk',
    });
  });

  test('a missing tenant or settings object does not throw', () => {
    expect(resolveCentreSettings(undefined).discountPolicy).toBe('staff');
    expect(resolveCentreSettings({ orgType: 'study_center', settings: {} }).openTime).toBe('06:00');
  });
});

describe('centreSettingsSchema', () => {
  test('accepts a valid window and policy', () => {
    expect(
      centreSettingsSchema.safeParse({
        openTime: '06:00',
        closeTime: '22:00',
        discountPolicy: 'desk',
      }).success
    ).toBe(true);
  });

  test('closing time must be later than opening time', () => {
    const r = centreSettingsSchema.safeParse({ openTime: '22:00', closeTime: '06:00' });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual(['closeTime']);
    expect(centreSettingsSchema.safeParse({ openTime: '10:00', closeTime: '10:00' }).success).toBe(
      false
    );
  });

  test('open 24 hours waives the ordering rule', () => {
    expect(
      centreSettingsSchema.safeParse({ open24h: true, openTime: '22:00', closeTime: '06:00' })
        .success
    ).toBe(true);
  });

  test.each(['6:00', '24:00', '12:60', 'noon', ''])('rejects the time %p', (value) => {
    expect(centreSettingsSchema.safeParse({ openTime: value }).success).toBe(false);
  });

  test('rejects an unknown policy and unknown keys', () => {
    expect(centreSettingsSchema.safeParse({ discountPolicy: 'everyone' }).success).toBe(false);
    expect(centreSettingsSchema.safeParse({ tenantId: 'x' }).success).toBe(false);
  });
});

describe('indianMobileSchema', () => {
  test.each([
    ['9876543210', '9876543210'],
    [' 98765 43210 ', '9876543210'],
    ['+91 98765-43210', '9876543210'],
    ['09876543210', '9876543210'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(indianMobileSchema.parse(input)).toBe(expected);
  });

  test.each(['5876543210', '98765', '98765432101', 'abcdefghij', ''])('rejects %p', (input) => {
    expect(indianMobileSchema.safeParse(input).success).toBe(false);
  });
});

describe('walkInSchema', () => {
  test('requires first name, last name and phone, and nothing else', () => {
    expect(
      walkInSchema.safeParse({ firstName: 'Asha', lastName: 'Rana', phone: '9876543210' }).success
    ).toBe(true);
    expect(walkInSchema.safeParse({ firstName: 'Asha', lastName: 'Rana' }).success).toBe(false);
    expect(
      walkInSchema.safeParse({ firstName: 'A', lastName: 'R', phone: '9876543210', kind: 'member' })
        .success
    ).toBe(false);
  });
});
