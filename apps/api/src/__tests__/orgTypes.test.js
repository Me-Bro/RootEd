import { isModuleEnabled, resolveOrgTerm, isBatchOrgType } from '@rooted/shared/utils';

test.each([
  ['school', 'inventory', true],
  ['school', 'academic', true],
  ['tuition_center', 'inventory', false],
  ['tuition_center', 'fee', true],
  ['college', 'inventory', true],
])('isModuleEnabled(%s, %s) -> %s', (orgType, moduleName, expected) => {
  expect(isModuleEnabled(orgType, moduleName)).toBe(expected);
});

test('isModuleEnabled falls back to school for an unknown orgType', () => {
  expect(isModuleEnabled('nonexistent_type', 'inventory')).toBe(true);
  expect(isModuleEnabled(undefined, 'inventory')).toBe(true);
});

test('isModuleEnabled falls back to the orgType default when a tenant-like object has no enabledModules override', () => {
  expect(isModuleEnabled({ orgType: 'tuition_center' }, 'inventory')).toBe(false);
  expect(isModuleEnabled({ orgType: 'school' }, 'inventory')).toBe(true);
});

test('isModuleEnabled uses enabledModules as a full override when set, ignoring the orgType default', () => {
  const tenant = { orgType: 'school', enabledModules: ['academic', 'staff'] };
  expect(isModuleEnabled(tenant, 'academic')).toBe(true);
  expect(isModuleEnabled(tenant, 'inventory')).toBe(false); // school would normally grant this
});

test.each([
  ['school', 'classLevel', 'Grade'],
  ['college', 'classLevel', 'Semester'],
  ['tuition_center', 'classLevel', 'Batch'],
  ['tuition_center', 'student', 'Learner'],
])('resolveOrgTerm(%s, %s) -> %s', (orgType, key, expected) => {
  expect(resolveOrgTerm(orgType, key)).toBe(expected);
});

test('resolveOrgTerm falls back to school terms for an unknown orgType', () => {
  expect(resolveOrgTerm('nonexistent_type', 'classLevel')).toBe('Grade');
});

test('resolveOrgTerm returns undefined for an unknown term key', () => {
  expect(resolveOrgTerm('school', 'nonexistent_key')).toBeUndefined();
});

test.each([
  ['school', false],
  ['college', false],
  ['tuition_center', true],
  ['coaching_center', true],
  ['study_center', true],
  ['nonexistent_type', false],
])('isBatchOrgType(%s) -> %s', (orgType, expected) => {
  expect(isBatchOrgType(orgType)).toBe(expected);
});
