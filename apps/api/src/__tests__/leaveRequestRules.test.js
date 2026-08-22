import {
  canFileLeaveForStaff,
  hasOverlappingLeaveRequest,
  isCurrentApprover,
} from '../services/leaveRequestRules.js';

test('staff can file leave for themselves', () => {
  expect(canFileLeaveForStaff({ staffId: 's1', actorStaffId: 's1', actorPermissions: [] })).toBe(
    true
  );
});

test('staff cannot file leave for someone else without staff:write', () => {
  expect(
    canFileLeaveForStaff({ staffId: 's2', actorStaffId: 's1', actorPermissions: ['leave:write'] })
  ).toBe(false);
});

test('staff:write holder can file leave on behalf of another staff member', () => {
  expect(
    canFileLeaveForStaff({ staffId: 's2', actorStaffId: 's1', actorPermissions: ['staff:write'] })
  ).toBe(true);
});

test('actor with no linked staff record still needs staff:write to file for someone', () => {
  expect(canFileLeaveForStaff({ staffId: 's2', actorStaffId: null, actorPermissions: [] })).toBe(
    false
  );
  expect(
    canFileLeaveForStaff({ staffId: 's2', actorStaffId: null, actorPermissions: ['staff:write'] })
  ).toBe(true);
});

test('no overlap when existing requests are on different dates', () => {
  const existing = [
    { fromDate: new Date('2026-01-01'), toDate: new Date('2026-01-03'), status: 'approved' },
  ];
  expect(hasOverlappingLeaveRequest(existing, new Date('2026-01-10'), new Date('2026-01-12'))).toBe(
    false
  );
});

test('overlap detected when new range intersects an existing pending/approved range', () => {
  const existing = [
    { fromDate: new Date('2026-01-05'), toDate: new Date('2026-01-10'), status: 'pending' },
  ];
  expect(hasOverlappingLeaveRequest(existing, new Date('2026-01-08'), new Date('2026-01-15'))).toBe(
    true
  );
});

test('overlap check ignores rejected and cancelled requests', () => {
  const existing = [
    { fromDate: new Date('2026-01-05'), toDate: new Date('2026-01-10'), status: 'rejected' },
    { fromDate: new Date('2026-01-05'), toDate: new Date('2026-01-10'), status: 'cancelled' },
  ];
  expect(hasOverlappingLeaveRequest(existing, new Date('2026-01-08'), new Date('2026-01-09'))).toBe(
    false
  );
});

test('single-day ranges touching on the same day count as overlapping', () => {
  const existing = [
    { fromDate: new Date('2026-01-10'), toDate: new Date('2026-01-10'), status: 'approved' },
  ];
  expect(hasOverlappingLeaveRequest(existing, new Date('2026-01-10'), new Date('2026-01-10'))).toBe(
    true
  );
});

test('isCurrentApprover true when actor matches the pending step approver', () => {
  const lr = {
    currentApproverIndex: 1,
    approvalChain: [
      { approverId: 'u1', status: 'approved' },
      { approverId: 'u2', status: 'pending' },
    ],
  };
  expect(isCurrentApprover(lr, 'u2')).toBe(true);
});

test("isCurrentApprover false when actor is a different step's approver", () => {
  const lr = {
    currentApproverIndex: 1,
    approvalChain: [
      { approverId: 'u1', status: 'approved' },
      { approverId: 'u2', status: 'pending' },
    ],
  };
  expect(isCurrentApprover(lr, 'u1')).toBe(false);
});

test('isCurrentApprover false when there is no step at the current index', () => {
  const lr = { currentApproverIndex: 5, approvalChain: [{ approverId: 'u1', status: 'approved' }] };
  expect(isCurrentApprover(lr, 'u1')).toBe(false);
});

test('isCurrentApprover compares ObjectId-like approverId via toString', () => {
  const lr = {
    currentApproverIndex: 0,
    approvalChain: [{ approverId: { toString: () => 'u1' }, status: 'pending' }],
  };
  expect(isCurrentApprover(lr, 'u1')).toBe(true);
});
