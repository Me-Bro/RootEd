import { Check, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { Avatar, AvatarFallback } from '../ui/avatar.jsx';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function initials(firstName, lastName) {
  const value = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
  return value || '?';
}

// `balance` is the full leave-balances array for the request's staff member
// (spec §2 — fetched lazily for whichever card is in view, not all 36 up
// front), not a single pre-matched value, so the card looks up the entry for
// this request's own leave type itself.
function findBalance(balances, leaveTypeId) {
  if (!leaveTypeId) return null;
  return (balances ?? []).find((b) => (b.leaveTypeId?._id ?? b.leaveTypeId) === leaveTypeId);
}

/**
 * One card in the pending-approval queue (spec: docs/mobile-ui/12-leave-requests-approved.html,
 * Mock 2 "Approval queue"). Renders full decision context — reason, dates,
 * projected balance, timetable conflicts — so the approver never needs a
 * click-through, then exposes Approve/Reject; the parent page advances the
 * queue to the next request once the decision succeeds.
 *
 * Contract per spec §4 is `{ request, balance, onApprove, onReject }`; `busy`
 * and `error` are additive (not in the spec's literal table) so the buttons
 * can't be double-submitted mid-mutation and a failed decision (e.g. a 403
 * because this approver isn't the current step in the chain) is visible
 * instead of silently doing nothing — see build report.
 */
export default function ApprovalQueueCard({ request, balance, onApprove, onReject, busy, error }) {
  const { t } = useTranslation();
  const staff = request.staffId ?? {};
  const leaveType = request.leaveTypeId ?? {};
  const matchedBalance = findBalance(balance, leaveType._id);
  const remainingAfter = matchedBalance
    ? matchedBalance.total - matchedBalance.used - request.totalDays
    : null;
  const conflictFlags = request.conflictFlags ?? [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials(staff.firstName, staff.lastName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-semibold leading-tight">
              {staff.firstName} {staff.lastName}
            </p>
            {staff.employeeId && (
              <p className="text-xs text-muted-foreground">{staff.employeeId}</p>
            )}
          </div>
        </div>

        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('staff.leaves.leaveTypeLabel')}</dt>
            <dd className="font-medium">{leaveType.name ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('staff.leaves.datesLabel')}</dt>
            <dd className="text-right font-medium">
              {formatDate(request.fromDate)} – {formatDate(request.toDate)} (
              {t('staff.leaves.dayCount', { count: request.totalDays })})
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('staff.leaves.reasonLabel')}</dt>
            <dd className="text-right font-medium">{request.reason || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t('staff.leaves.balanceAfterLabel')}</dt>
            <dd className="text-right font-medium">
              {remainingAfter === null
                ? t('staff.leaves.notTracked')
                : t('staff.leaves.balanceAfterValue', {
                    left: Math.max(remainingAfter, 0),
                    total: matchedBalance.total,
                    type: leaveType.name ?? '',
                  })}
            </dd>
          </div>
        </dl>

        {conflictFlags.length > 0 && (
          <Badge variant="warning" className="w-fit gap-1" title={conflictFlags.join(', ')}>
            <AlertTriangle size={12} />
            {t('staff.leaves.timetableConflict', { count: conflictFlags.length })}
          </Badge>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button className="flex-1 gap-1.5" onClick={onApprove} disabled={busy}>
            <Check size={14} />
            {t('staff.leaves.approve')}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onReject} disabled={busy}>
            {t('staff.leaves.reject')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
