const OVERLAP_BLOCKING_STATUSES = ['pending', 'approved'];

export function canFileLeaveForStaff({ staffId, actorStaffId, actorPermissions }) {
  if (actorStaffId && staffId.toString() === actorStaffId.toString()) return true;
  return (actorPermissions ?? []).includes('staff:write');
}

export function hasOverlappingLeaveRequest(existingRequests, fromDate, toDate) {
  return existingRequests
    .filter((r) => OVERLAP_BLOCKING_STATUSES.includes(r.status))
    .some((r) => r.fromDate <= toDate && r.toDate >= fromDate);
}

export function isCurrentApprover(leaveRequest, actorUserId) {
  const step = leaveRequest.approvalChain[leaveRequest.currentApproverIndex];
  if (!step) return false;
  return step.approverId?.toString() === actorUserId?.toString();
}
