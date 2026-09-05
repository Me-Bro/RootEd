import {
  usernameSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '@rooted/shared/schemas';
import { RESERVED_USERNAMES, USERNAME_MAX_LENGTH } from '@rooted/shared/constants';

const ok = (schema, value) => schema.safeParse(value).success;

describe('usernameSchema', () => {
  test('accepts letters, digits and inner separators', () => {
    for (const v of ['rita', 'rita.bose', 'p_sharma', 'a-b-c', 'user123']) {
      expect(ok(usernameSchema, v)).toBe(true);
    }
  });

  test('normalises case and surrounding whitespace', () => {
    expect(usernameSchema.parse('  Rita.Bose  ')).toBe('rita.bose');
  });

  test('rejects an @ — this is what keeps the login identifier unambiguous', () => {
    expect(ok(usernameSchema, 'rita@school.edu')).toBe(false);
  });

  test('rejects a leading or trailing separator', () => {
    for (const v of ['.rita', 'rita.', '-rita', 'rita_']) {
      expect(ok(usernameSchema, v)).toBe(false);
    }
  });

  test('rejects characters outside the allowed set', () => {
    for (const v of ['rita bose', 'rita/bose', 'rita+bose', 'ritä']) {
      expect(ok(usernameSchema, v)).toBe(false);
    }
  });

  test('enforces the length bounds', () => {
    expect(ok(usernameSchema, 'ab')).toBe(false);
    expect(ok(usernameSchema, 'abc')).toBe(true);
    expect(ok(usernameSchema, 'a'.repeat(USERNAME_MAX_LENGTH))).toBe(true);
    expect(ok(usernameSchema, 'a'.repeat(USERNAME_MAX_LENGTH + 1))).toBe(false);
  });

  test('rejects every reserved name, including by casing', () => {
    for (const reserved of RESERVED_USERNAMES) {
      expect(ok(usernameSchema, reserved)).toBe(false);
      expect(ok(usernameSchema, reserved.toUpperCase())).toBe(false);
    }
  });
});

describe('loginSchema', () => {
  test('accepts an email identifier', () => {
    expect(ok(loginSchema, { identifier: 'rita@school.edu', password: 'password123' })).toBe(true);
  });

  test('accepts a username identifier', () => {
    expect(ok(loginSchema, { identifier: 'rita.bose', password: 'password123' })).toBe(true);
  });

  test('rejects a malformed email identifier rather than treating it as a username', () => {
    // Contains '@', so it is an email — and not a valid one. Falling back to a
    // username lookup here would make the identifier ambiguous again.
    expect(ok(loginSchema, { identifier: 'rita@', password: 'password123' })).toBe(false);
  });

  test('still enforces the password minimum', () => {
    expect(ok(loginSchema, { identifier: 'rita.bose', password: 'short' })).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    email: 'Rita@School.EDU',
    username: 'rita.bose',
    password: 'password123',
    firstName: 'Rita',
    lastName: 'Bose',
  };

  test('accepts a complete registration and lowercases the email', () => {
    expect(registerSchema.parse(valid).email).toBe('rita@school.edu');
  });

  test('rejects a reserved username', () => {
    expect(ok(registerSchema, { ...valid, username: 'admin' })).toBe(false);
  });

  test('requires both names', () => {
    expect(ok(registerSchema, { ...valid, firstName: '' })).toBe(false);
    expect(ok(registerSchema, { ...valid, lastName: '   ' })).toBe(false);
  });
});

describe('updateProfileSchema', () => {
  test('accepts a single field', () => {
    expect(ok(updateProfileSchema, { firstName: 'Rita' })).toBe(true);
  });

  test('rejects an empty patch', () => {
    expect(ok(updateProfileSchema, {})).toBe(false);
  });

  test('applies the same username rules as registration', () => {
    expect(ok(updateProfileSchema, { username: 'support' })).toBe(false);
    expect(ok(updateProfileSchema, { username: 'rita@x' })).toBe(false);
  });
});
