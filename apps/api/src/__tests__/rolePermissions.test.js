import { PERMISSIONS as SHARED_PERMISSIONS } from '@rooted/shared/constants';
import { Role, PERMISSIONS, DEFAULT_ROLE_TEMPLATES } from '../models/Role.js';

test('Role.js re-exports the shared list rather than declaring its own', () => {
  // Identity, not deep equality: a re-declared copy would still pass toEqual
  // while being free to drift, which is the failure this guards against.
  expect(PERMISSIONS).toBe(SHARED_PERMISSIONS);
});

test('the Role schema enum is the shared permission list', () => {
  // Mongoose copies the enum array into the SchemaType rather than holding the
  // reference, so this is value equality — the identity guard above is what
  // catches a re-declared list.
  const enumValues = Role.schema.path('permissions').caster.options.enum;
  expect(enumValues).toEqual(SHARED_PERMISSIONS);
});

test('every permission granted by a role template is a real permission', () => {
  const valid = new Set(SHARED_PERMISSIONS);
  for (const [templateKey, granted] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
    const unknown = granted.filter((p) => !valid.has(p));
    // The teacher/accountant/librarian templates are hand-written string
    // arrays, so a typo here silently grants nothing at all.
    expect({ templateKey, unknown }).toEqual({ templateKey, unknown: [] });
  }
});

test('no role template grants a permission outside its own module surface', () => {
  // tenant_admin is the full set by construction; principal is derived by
  // filter. The rest are hand-maintained and worth pinning.
  expect(DEFAULT_ROLE_TEMPLATES.tenant_admin).toBe(SHARED_PERMISSIONS);
  expect(DEFAULT_ROLE_TEMPLATES.principal).not.toContain('students:write');
  expect(DEFAULT_ROLE_TEMPLATES.principal).toContain('leave:approve');
  expect(DEFAULT_ROLE_TEMPLATES.principal).toContain('expense:approve');
  // 'tenant:admin' does not end in ':write', so the template's filter used to
  // let it through and every principal was a de-facto tenant administrator.
  expect(DEFAULT_ROLE_TEMPLATES.principal).not.toContain('tenant:admin');
  expect(DEFAULT_ROLE_TEMPLATES.teacher).not.toContain('tenant:admin');
  expect(DEFAULT_ROLE_TEMPLATES.librarian).toEqual(['inventory:read', 'inventory:write']);
});

test('tenant_admin is the only template granting tenant:admin', () => {
  const granting = Object.entries(DEFAULT_ROLE_TEMPLATES)
    .filter(([, perms]) => perms.includes('tenant:admin'))
    .map(([key]) => key);
  expect(granting).toEqual(['tenant_admin']);
});
