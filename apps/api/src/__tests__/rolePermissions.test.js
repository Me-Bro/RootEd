import { PERMISSIONS as SHARED_PERMISSIONS, isSelfScoped } from '@rooted/shared/constants';
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
  // tenant_admin is everything except the self-scoped permissions; principal is
  // derived by filter. The rest are hand-maintained and worth pinning.
  expect(DEFAULT_ROLE_TEMPLATES.tenant_admin).toEqual(
    SHARED_PERMISSIONS.filter((p) => !isSelfScoped(p))
  );
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

describe('self-scoped permissions', () => {
  const selfScoped = SHARED_PERMISSIONS.filter(isSelfScoped);

  test('a self: permission never satisfies its tenant-wide counterpart', () => {
    // The reason for the 'self:' prefix rather than a ':self' suffix. A
    // suffixed 'grades:read:self' sorts next to 'grades:read' and any
    // startsWith() check would silently grant the whole school.
    for (const permission of selfScoped) {
      const tenantWide = permission.replace(/^self:/, '');
      expect(permission).not.toBe(tenantWide);
      expect(permission.startsWith(tenantWide)).toBe(false);
      expect([permission].includes(tenantWide)).toBe(false);
    }
  });

  test('the student template holds nothing except self: permissions', () => {
    expect(DEFAULT_ROLE_TEMPLATES.student.length).toBeGreaterThan(0);
    expect(DEFAULT_ROLE_TEMPLATES.student.filter((p) => !isSelfScoped(p))).toEqual([]);
  });

  test('no tenant-wide template carries a self: permission', () => {
    for (const [key, granted] of Object.entries(DEFAULT_ROLE_TEMPLATES)) {
      if (key === 'student') continue;
      expect({ key, self: granted.filter(isSelfScoped) }).toEqual({ key, self: [] });
    }
  });

  // 'timetable:read' does not exist: tenant-wide timetable reads are gated on
  // 'students:read'. That is a wart in the permission naming, not in the
  // self-scoped set — splitting it out means a new permission and a backfill
  // for every existing role, so it is tracked rather than bundled here.
  const WITHOUT_TENANT_WIDE_COUNTERPART = ['self:timetable:read'];

  test('every self: permission has a real tenant-wide counterpart', () => {
    // Guards against a typo like 'self:grade:read' that would gate a route
    // nobody could ever satisfy.
    for (const permission of selfScoped) {
      if (WITHOUT_TENANT_WIDE_COUNTERPART.includes(permission)) continue;
      expect(SHARED_PERMISSIONS).toContain(permission.replace(/^self:/, ''));
    }
  });

  test('the counterpart exception list stays honest', () => {
    // If someone adds 'timetable:read' properly, this fails and the exception
    // above should be deleted rather than extended.
    for (const permission of WITHOUT_TENANT_WIDE_COUNTERPART) {
      expect(selfScoped).toContain(permission);
      expect(SHARED_PERMISSIONS).not.toContain(permission.replace(/^self:/, ''));
    }
  });
});
