process.env.APP_DOMAIN = 'example.com';
process.env.PORTAL_SUBDOMAIN = 'rooted';
process.env.EXTRA_ALLOWED_ORIGINS = 'https://rooted.other.online, https://b.other.online';

const { getPortalHost } = await import('../config/env.js');

test('defaults to the canonical portal host', () => {
  expect(getPortalHost()).toBe('rooted.example.com');
  expect(getPortalHost('')).toBe('rooted.example.com');
});

test('keeps an allowed second-domain host, ignoring case and port', () => {
  expect(getPortalHost('rooted.other.online')).toBe('rooted.other.online');
  expect(getPortalHost('Rooted.Other.Online:443')).toBe('rooted.other.online');
  expect(getPortalHost('rooted.example.com')).toBe('rooted.example.com');
});

test('a forged or unlisted Host falls back to canonical', () => {
  for (const h of ['evil.com', 'other.online', 'x.rooted.other.online', 'acme.example.com']) {
    expect(getPortalHost(h)).toBe('rooted.example.com');
  }
});
