process.env.APP_DOMAIN = 'example.com';
process.env.EXTRA_ALLOWED_ORIGINS = ' https://uat.other.online , https://b.other.online ';

const { isAllowedOrigin } = await import('../config/env.js');

test('allows APP_DOMAIN apex and subdomains', () => {
  expect(isAllowedOrigin('https://example.com')).toBe(true);
  expect(isAllowedOrigin('https://acme.example.com')).toBe(true);
});

test('allows exact EXTRA_ALLOWED_ORIGINS entries (trimmed)', () => {
  expect(isAllowedOrigin('https://uat.other.online')).toBe(true);
  expect(isAllowedOrigin('https://b.other.online')).toBe(true);
});

test('rejects everything else, including lookalikes and unlisted subdomains', () => {
  expect(isAllowedOrigin('https://evil.com')).toBe(false);
  expect(isAllowedOrigin('https://other.online')).toBe(false);
  expect(isAllowedOrigin('https://x.uat.other.online')).toBe(false);
  expect(isAllowedOrigin('http://uat.other.online')).toBe(false);
});
