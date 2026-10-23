process.env.APP_DOMAIN = 'example.com';
process.env.PORTAL_SUBDOMAIN = 'rooted';
process.env.CATALYST_PUBLIC_URL = 'https://catalyst.example.com/';

const { getResetBaseUrl } = await import('../config/env.js');

test('a reset requested from the portal opens in the portal, without a trailing slash', () => {
  expect(getResetBaseUrl('portal', 'rooted.example.com')).toBe('https://catalyst.example.com');
});

test('every other request keeps the main app link', () => {
  expect(getResetBaseUrl(undefined, 'rooted.example.com')).toBe('https://rooted.example.com');
  expect(getResetBaseUrl('web', 'rooted.example.com')).toBe('https://rooted.example.com');
});

test('a forged Host never decides the portal link', () => {
  expect(getResetBaseUrl('portal', 'evil.com')).toBe('https://catalyst.example.com');
  expect(getResetBaseUrl(undefined, 'evil.com')).toBe('https://rooted.example.com');
});
