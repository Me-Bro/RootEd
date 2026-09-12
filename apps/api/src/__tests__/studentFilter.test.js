import { buildStudentFilter } from '../utils/studentFilter.js';

const tenantId = 'tenant-1';

test('base filter has only tenantId when no query params given', () => {
  expect(buildStudentFilter(tenantId, {})).toEqual({ tenantId });
});

test('sectionId and status pass through as exact match', () => {
  expect(buildStudentFilter(tenantId, { sectionId: 'sec-1', status: 'active' })).toEqual({
    tenantId,
    sectionId: 'sec-1',
    status: 'active',
  });
});

test('search adds case-insensitive $or across firstName/lastName/admissionNo', () => {
  const filter = buildStudentFilter(tenantId, { search: 'jane' });
  expect(filter.tenantId).toBe(tenantId);
  expect(filter.$or).toHaveLength(3);
  for (const clause of filter.$or) {
    const [field, value] = Object.entries(clause)[0];
    expect(['firstName', 'lastName', 'admissionNo']).toContain(field);
    expect(value).toBeInstanceOf(RegExp);
    expect(value.flags).toContain('i');
    expect('Jane Doe').toMatch(field === 'admissionNo' ? /jane/i : value);
  }
});

test('blank/whitespace-only search is ignored', () => {
  expect(buildStudentFilter(tenantId, { search: '   ' })).toEqual({ tenantId });
});

test('regex metacharacters in search are escaped, not treated as regex', () => {
  const filter = buildStudentFilter(tenantId, { search: 'a+b(c' });
  const [, firstNameRegex] = Object.entries(filter.$or[0])[0];
  expect('xa+b(cx').toMatch(firstNameRegex);
  expect('xaaaaaaaacx').not.toMatch(firstNameRegex);
});

test('sectionId stays exact-match for a non-batch orgType even with enrolledStudentIds given', () => {
  const filter = buildStudentFilter(
    tenantId,
    { sectionId: 'sec-1' },
    { orgType: 'school', enrolledStudentIds: ['stu-1', 'stu-2'] }
  );
  expect(filter).toEqual({ tenantId, sectionId: 'sec-1' });
});

test('sectionId resolves to an _id $in filter for a batch orgType with enrolledStudentIds given', () => {
  const filter = buildStudentFilter(
    tenantId,
    { sectionId: 'sec-1' },
    { orgType: 'tuition_center', enrolledStudentIds: ['stu-1', 'stu-2'] }
  );
  expect(filter).toEqual({ tenantId, _id: { $in: ['stu-1', 'stu-2'] } });
});

test('sectionId stays exact-match for a batch orgType when enrolledStudentIds is not given', () => {
  const filter = buildStudentFilter(
    tenantId,
    { sectionId: 'sec-1' },
    { orgType: 'tuition_center' }
  );
  expect(filter).toEqual({ tenantId, sectionId: 'sec-1' });
});
