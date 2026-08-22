import { parseFeeStructureImportRow } from '../utils/feeImportParser.js';

test('parses a row with two components', () => {
  const result = parseFeeStructureImportRow({
    name: 'Imported Fee',
    academicYearId: '507f1f77bcf86cd799439011',
    dueDate: '2025-10-01',
    component1Label: 'Tuition',
    component1Amount: '5000',
    component2Label: 'Activity',
    component2Amount: '500',
  });
  expect(result.components).toEqual([
    { label: 'Tuition', amount: 5000, isOptional: false },
    { label: 'Activity', amount: 500, isOptional: false },
  ]);
});

test('throws when name is missing', () => {
  expect(() =>
    parseFeeStructureImportRow({
      academicYearId: 'x',
      component1Label: 'T',
      component1Amount: '1',
    })
  ).toThrow(/Missing required fields/);
});

test('throws when a component has a label but no amount', () => {
  expect(() =>
    parseFeeStructureImportRow({
      name: 'N',
      academicYearId: 'x',
      component1Label: 'T',
      component1Amount: '',
    })
  ).toThrow(/must both be present/);
});

test('throws when no components are present at all', () => {
  expect(() => parseFeeStructureImportRow({ name: 'N', academicYearId: 'x' })).toThrow(
    /At least one component/
  );
});

test('skips gaps -- component2 empty does not block component3', () => {
  const result = parseFeeStructureImportRow({
    name: 'N',
    academicYearId: 'x',
    component1Label: 'A',
    component1Amount: '1',
    component3Label: 'C',
    component3Amount: '3',
  });
  expect(result.components.map((c) => c.label)).toEqual(['A', 'C']);
});
