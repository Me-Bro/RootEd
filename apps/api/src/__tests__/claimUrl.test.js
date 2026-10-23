process.env.APP_DOMAIN = 'example.com';
process.env.PORTAL_SUBDOMAIN = 'rooted';
process.env.CATALYST_PUBLIC_URL = 'https://catalyst.example.com/';

const { claimUrlFor } = await import('../services/identity.service.js');

test('a college running the training programme claims in the Catalyst portal', () => {
  const college = { orgType: 'college', subdomain: 'cc' };
  expect(claimUrlFor(college, 'tok')).toBe(
    'https://catalyst.example.com/reset-password?token=tok&welcome=1'
  );
});

test('a school (no training module) keeps the tenant host link', () => {
  expect(claimUrlFor({ orgType: 'school', subdomain: 'greenfield' }, 'tok')).toBe(
    'https://greenfield.example.com/accept-invite?token=tok'
  );
});

test('a college that switched the module off keeps the tenant host link', () => {
  const college = { orgType: 'college', subdomain: 'cc', enabledModules: ['academic'] };
  expect(claimUrlFor(college, 'tok')).toBe('https://cc.example.com/accept-invite?token=tok');
});

test('a tenant without a subdomain falls back to the general portal host', () => {
  expect(claimUrlFor({ orgType: 'school' }, 'tok')).toBe(
    'https://rooted.example.com/accept-invite?token=tok'
  );
});
