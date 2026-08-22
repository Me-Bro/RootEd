import {
  salaryComponentSchema,
  createSalaryStructureSchema,
  updateSalaryStructureSchema,
} from '@rooted/shared/schemas';

function component(overrides = {}) {
  return {
    id: 'basic',
    label: 'Basic',
    type: 'earning',
    amount: 30000,
    isPercentage: false,
    ...overrides,
  };
}

test('component missing id is rejected', () => {
  const { id, ...noId } = component();
  void id;
  expect(salaryComponentSchema.safeParse(noId).success).toBe(false);
});

test('createSalaryStructureSchema rejects a percentage baseRef that does not match any sibling id', () => {
  const result = createSalaryStructureSchema.safeParse({
    name: 'Test',
    components: [
      component(),
      component({
        id: 'hra',
        label: 'HRA',
        isPercentage: true,
        amount: 40,
        baseRef: 'nonexistent',
      }),
    ],
  });
  expect(result.success).toBe(false);
});

test('createSalaryStructureSchema accepts a percentage baseRef matching a sibling id even when labels differ from ids', () => {
  const result = createSalaryStructureSchema.safeParse({
    name: 'Test',
    components: [
      component({ id: 'c1', label: 'Basic Pay' }),
      component({ id: 'c2', label: 'HRA', isPercentage: true, amount: 40, baseRef: 'c1' }),
    ],
  });
  expect(result.success).toBe(true);
});

test('createSalaryStructureSchema rejects duplicate component ids', () => {
  const result = createSalaryStructureSchema.safeParse({
    name: 'Test',
    components: [component({ id: 'dup' }), component({ id: 'dup', label: 'Other' })],
  });
  expect(result.success).toBe(false);
});

test('updateSalaryStructureSchema rejects the same invalid-baseRef-by-id payload as create', () => {
  const result = updateSalaryStructureSchema.safeParse({
    components: [
      component(),
      component({
        id: 'hra',
        label: 'HRA',
        isPercentage: true,
        amount: 40,
        baseRef: 'nonexistent',
      }),
    ],
  });
  expect(result.success).toBe(false);
});

test('updateSalaryStructureSchema allows omitting components entirely', () => {
  const result = updateSalaryStructureSchema.safeParse({ name: 'Renamed' });
  expect(result.success).toBe(true);
});

test('percentage component amount of 0 and 100 are valid (inclusive boundaries)', () => {
  expect(
    salaryComponentSchema.safeParse(
      component({ id: 'p0', isPercentage: true, amount: 0, baseRef: 'basic' })
    ).success
  ).toBe(true);
  expect(
    salaryComponentSchema.safeParse(
      component({ id: 'p100', isPercentage: true, amount: 100, baseRef: 'basic' })
    ).success
  ).toBe(true);
});

test('percentage component amount above 100 or below 0 is rejected', () => {
  expect(
    salaryComponentSchema.safeParse(
      component({ id: 'over', isPercentage: true, amount: 100.01, baseRef: 'basic' })
    ).success
  ).toBe(false);
  expect(
    salaryComponentSchema.safeParse(
      component({ id: 'neg', isPercentage: true, amount: -1, baseRef: 'basic' })
    ).success
  ).toBe(false);
});

test('percentage cap does not apply to non-percentage components', () => {
  expect(salaryComponentSchema.safeParse(component({ id: 'big', amount: 500000 })).success).toBe(
    true
  );
});

test('createSalaryStructureSchema rejects a structure with an out-of-range percentage component', () => {
  const result = createSalaryStructureSchema.safeParse({
    name: 'Test',
    components: [
      component(),
      component({ id: 'hra', label: 'HRA', isPercentage: true, amount: 150, baseRef: 'basic' }),
    ],
  });
  expect(result.success).toBe(false);
});

test('updateSalaryStructureSchema also rejects an out-of-range percentage component', () => {
  const result = updateSalaryStructureSchema.safeParse({
    components: [
      component(),
      component({ id: 'hra', label: 'HRA', isPercentage: true, amount: 150, baseRef: 'basic' }),
    ],
  });
  expect(result.success).toBe(false);
});
