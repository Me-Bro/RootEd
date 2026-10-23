// Pure helpers in src/lib: no browser, no API.
import { test, expect } from '@playwright/test';
import { hasPermission, currentCollege, homeRoute } from '../src/lib/access.js';
import { fmtPct, fmtNum, fullName, matchesQuery, DASH } from '../src/lib/format.js';
import { nextUp, scheduleLabel } from '../src/lib/roadmap.js';

const college = { _id: 'c1', name: 'Test School' };
const member = (extra = {}) => ({
  orgs: [college],
  tenantId: 'c1',
  enabledModules: ['training'],
  permissions: [],
  ...extra,
});

test.describe('access', () => {
  test('hasPermission is false for no user or no permissions', () => {
    expect(hasPermission(null, 'training:read')).toBe(false);
    expect(hasPermission({}, 'training:read')).toBe(false);
    expect(hasPermission({ permissions: ['training:read'] }, 'training:read')).toBe(true);
    expect(hasPermission({ permissions: ['training:read'] }, 'training:write')).toBe(false);
  });

  test('currentCollege matches the session tenant, comparing ids as strings', () => {
    expect(currentCollege(member({ tenantId: 'c1' }))).toBe(college);
    expect(currentCollege(member({ tenantId: 'other' }))).toBeNull();
    expect(currentCollege(null)).toBeNull();
  });

  test.describe('homeRoute', () => {
    test('no user goes to login, a super admin to outcomes', () => {
      expect(homeRoute(null)).toEqual({ path: '/login' });
      expect(homeRoute({ systemRole: 'super_admin' })).toEqual({ path: '/outcomes' });
    });

    test('belonging to no college is /no-access, never a blank page', () => {
      expect(homeRoute({ orgs: [] })).toEqual({ path: '/no-access', reason: 'no-college' });
    });

    test('several colleges and none chosen yet asks which one', () => {
      expect(homeRoute(member({ tenantId: null }))).toEqual({ path: '/select-college' });
    });

    test('a college without the training module is /no-access (module)', () => {
      expect(homeRoute(member({ enabledModules: ['fees'] }))).toEqual({
        path: '/no-access',
        reason: 'module',
      });
    });

    test('staff land on the dashboard, students on their progress', () => {
      expect(homeRoute(member({ permissions: ['training:read'] })).path).toBe('/dashboard');
      expect(homeRoute(member({ permissions: ['self:training:read'] })).path).toBe('/me/progress');
    });

    test('staff access wins when someone holds both', () => {
      const both = member({ permissions: ['self:training:read', 'training:read'] });
      expect(homeRoute(both).path).toBe('/dashboard');
    });

    test('no training permission is /no-access (role)', () => {
      expect(homeRoute(member({ permissions: ['library:read'] }))).toEqual({
        path: '/no-access',
        reason: 'role',
      });
    });
  });
});

test.describe('format', () => {
  test('a missing figure is a dash, never 0', () => {
    expect(fmtPct(null)).toBe(DASH);
    expect(fmtPct(undefined)).toBe(DASH);
    expect(fmtPct(0)).toBe('0%');
    expect(fmtNum(null)).toBe(DASH);
    expect(fmtNum(0)).toBe('0');
  });

  test('fullName tolerates a missing student or last name', () => {
    expect(fullName(null)).toBe(DASH);
    expect(fullName({ firstName: 'Asha', lastName: 'Rao' })).toBe('Asha Rao');
    expect(fullName({ firstName: 'Asha' })).toBe('Asha');
  });

  test('matchesQuery ignores case and padding, and an empty search matches all', () => {
    expect(matchesQuery('', 'Asha Rao', 'A1')).toBe(true);
    expect(matchesQuery('  RAO ', 'Asha Rao', 'A1')).toBe(true);
    expect(matchesQuery('a1', 'Asha Rao', 'A1')).toBe(true);
    expect(matchesQuery('zzz', 'Asha Rao', 'A1')).toBe(false);
    expect(matchesQuery('rao', 'Asha Rao', undefined, null)).toBe(true);
  });
});

test.describe('roadmap scheduleLabel', () => {
  const t = (key, { n }) => `${key}:${n}`;

  test('labels a day or week, and is empty without a timeline or a number', () => {
    expect(scheduleLabel({ dayNumber: 3 }, 'daily', t)).toBe('roadmap.day:3');
    expect(scheduleLabel({ weekNumber: 2 }, 'weekly', t)).toBe('roadmap.week:2');
    expect(scheduleLabel({}, 'daily', t)).toBe('');
    expect(scheduleLabel({ dayNumber: 3 }, 'none', t)).toBe('');
    expect(scheduleLabel({}, 'dated', t)).toBe('');
  });
});

test.describe('roadmap nextUp', () => {
  const item = (title, open, completed) => ({ title, open, completed });

  test('is the first open item that is not done, across roadmaps in order', () => {
    const roadmaps = [
      { items: [item('a', true, true), item('b', false, false)] },
      { items: [item('c', true, false), item('d', true, false)] },
    ];
    expect(nextUp(roadmaps).item.title).toBe('c');
    expect(nextUp(roadmaps).roadmap).toBe(roadmaps[1]);
  });

  test('is nothing when everything open is done, or there are no roadmaps', () => {
    expect(nextUp([{ items: [item('a', true, true), item('b', false, false)] }])).toBeNull();
    expect(nextUp([])).toBeNull();
  });
});
